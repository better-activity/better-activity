/**
 * MongoDB adapter.
 *
 * Accepts a `Db` instance (mongodb 6.x). Each `model` maps to a collection.
 * The library only writes to one collection (`activity` by default) so the
 * footprint is small.
 *
 * Operator translation:
 *   eq → $eq           contains → $regex .*v.*           starts_with → $regex ^v
 *   ne → $ne           ends_with → $regex v$            in → $in
 *   lt/lte/gt/gte → $lt/$lte/$gt/$gte         not_in → $nin
 */

import { createAdapterFactory } from "../adapter-factory";
import type { CleanedWhere, CustomAdapter } from "../adapter";

export interface MongoCollection {
  insertOne: (doc: Record<string, unknown>) => Promise<unknown>;
  insertMany: (docs: Record<string, unknown>[]) => Promise<unknown>;
  findOne: (
    filter: Record<string, unknown>,
    options?: { projection?: Record<string, 0 | 1> },
  ) => Promise<Record<string, unknown> | null>;
  find: (filter: Record<string, unknown>) => {
    sort: (s: Record<string, 1 | -1>) => unknown;
    skip: (n: number) => unknown;
    limit: (n: number) => unknown;
    project: (p: Record<string, 0 | 1>) => unknown;
    toArray: () => Promise<Record<string, unknown>[]>;
  };
  countDocuments: (filter: Record<string, unknown>) => Promise<number>;
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: { returnDocument?: "after" | "before" },
  ) => Promise<Record<string, unknown> | null>;
  updateMany: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => Promise<{ modifiedCount: number }>;
  deleteOne: (filter: Record<string, unknown>) => Promise<{ deletedCount: number }>;
  deleteMany: (filter: Record<string, unknown>) => Promise<{ deletedCount: number }>;
}

export interface MongoDBLike {
  collection: (name: string) => MongoCollection;
}

export interface MongoDBAdapterConfig {
  db: MongoDBLike;
  debugLogs?: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clauseToMongo(c: CleanedWhere): Record<string, unknown> {
  const insensitive =
    c.mode === "insensitive" &&
    (typeof c.value === "string" ||
      (Array.isArray(c.value) && c.value.every((v) => typeof v === "string")));
  switch (c.operator) {
    case "eq":
      if (c.value === null) return { [c.field]: { $eq: null } };
      if (insensitive)
        return {
          [c.field]: { $regex: `^${escapeRegex(String(c.value))}$`, $options: "i" },
        };
      return { [c.field]: { $eq: c.value } };
    case "ne":
      if (c.value === null) return { [c.field]: { $ne: null } };
      return { [c.field]: { $ne: c.value } };
    case "lt":
      return { [c.field]: { $lt: c.value } };
    case "lte":
      return { [c.field]: { $lte: c.value } };
    case "gt":
      return { [c.field]: { $gt: c.value } };
    case "gte":
      return { [c.field]: { $gte: c.value } };
    case "in":
      return { [c.field]: { $in: Array.isArray(c.value) ? c.value : [c.value] } };
    case "not_in":
      return { [c.field]: { $nin: Array.isArray(c.value) ? c.value : [c.value] } };
    case "contains":
      return {
        [c.field]: {
          $regex: escapeRegex(String(c.value)),
          ...(insensitive ? { $options: "i" } : {}),
        },
      };
    case "starts_with":
      return {
        [c.field]: {
          $regex: `^${escapeRegex(String(c.value))}`,
          ...(insensitive ? { $options: "i" } : {}),
        },
      };
    case "ends_with":
      return {
        [c.field]: {
          $regex: `${escapeRegex(String(c.value))}$`,
          ...(insensitive ? { $options: "i" } : {}),
        },
      };
    default:
      return {};
  }
}

/**
 * Fold a `CleanedWhere[]` into a Mongo filter expression. The first clause's
 * connector is ignored; subsequent OR clauses promote the accumulator into
 * an `$or` and reset.
 */
function buildMongoFilter(where: CleanedWhere[]): Record<string, unknown> {
  if (where.length === 0) return {};
  // Group consecutive AND clauses; an OR break splits into an $or group.
  const groups: Record<string, unknown>[][] = [[]];
  for (let i = 0; i < where.length; i++) {
    const c = where[i]!;
    if (i > 0 && c.connector === "OR") {
      groups.push([clauseToMongo(c)]);
    } else {
      groups[groups.length - 1]!.push(clauseToMongo(c));
    }
  }
  const andOfEach = groups.map((g) => (g.length === 1 ? g[0]! : { $and: g }));
  if (andOfEach.length === 1) return andOfEach[0]!;
  return { $or: andOfEach };
}

function projection(select: string[] | undefined): Record<string, 0 | 1> | undefined {
  if (!select?.length) return undefined;
  const p: Record<string, 0 | 1> = {};
  for (const s of select) p[s] = 1;
  return p;
}

export const mongodbAdapter = (config: MongoDBAdapterConfig) => {
  const { db, debugLogs } = config;
  return createAdapterFactory({
    config: {
      adapterId: "mongodb",
      adapterName: "MongoDB Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      debugLogs,
    },
    adapter: ({ table, debugLog }): CustomAdapter => ({
      async create({ data }) {
        debugLog("create", data);
        await db.collection(table.name).insertOne(data as Record<string, unknown>);
        return data;
      },
      async createMany({ data }) {
        if (data.length === 0) return [];
        await db.collection(table.name).insertMany(data as Record<string, unknown>[]);
        return data;
      },
      async findOne({ where, select }) {
        const filter = buildMongoFilter(where);
        const row = await db
          .collection(table.name)
          .findOne(filter, { projection: projection(select) });
        return (row ?? null) as never;
      },
      async findMany({ where, limit, select, sortBy, offset }) {
        const filter = buildMongoFilter(where ?? []);
        const cursor = db.collection(table.name).find(filter);
        if (sortBy) cursor.sort({ [sortBy.field]: sortBy.direction === "asc" ? 1 : -1 });
        if (offset) cursor.skip(offset);
        cursor.limit(Math.max(0, Number(limit) || 100));
        const proj = projection(select);
        if (proj) cursor.project(proj);
        return (await cursor.toArray()) as never;
      },
      async count({ where }) {
        return db.collection(table.name).countDocuments(buildMongoFilter(where ?? []));
      },
      async update({ where, update }) {
        const row = await db
          .collection(table.name)
          .findOneAndUpdate(buildMongoFilter(where), { $set: update }, { returnDocument: "after" });
        return (row ?? null) as never;
      },
      async updateMany({ where, update }) {
        const res = await db
          .collection(table.name)
          .updateMany(buildMongoFilter(where), { $set: update });
        return res.modifiedCount;
      },
      async delete({ where }) {
        await db.collection(table.name).deleteOne(buildMongoFilter(where));
      },
      async deleteMany({ where }) {
        const res = await db.collection(table.name).deleteMany(buildMongoFilter(where));
        return res.deletedCount;
      },
      async createSchema({ file }) {
        // MongoDB is schemaless; we still emit a JS helper that creates
        // the recommended indexes.
        const indexes = [
          "{ entity: 1, entityId: 1 }",
          "{ actorId: 1 }",
          "{ createdAt: -1 }",
          "{ action: 1 }",
        ];
        const code = `// Recommended MongoDB indexes for the activity collection.
import type { Db } from "mongodb";
export async function ensureActivityIndexes(db: Db) {
  const col = db.collection(${JSON.stringify(table.name)});
  await Promise.all([
${indexes.map((i) => `    col.createIndex(${i}),`).join("\n")}
  ]);
}
`;
        return { code, path: file ?? "./migrations/mongodb-activity.ts" };
      },
    }),
  });
};

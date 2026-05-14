/**
 * Drizzle adapter.
 *
 * Drizzle's API is column-builder-centric, so the caller passes:
 *   - a `db` (Drizzle instance, any dialect),
 *   - the `table` (the Drizzle pgTable / mysqlTable / sqliteTable definition)
 *
 * Drizzle's operator helpers (`eq`, `ne`, `like`, `ilike`, `and`, `or`,
 * `inArray`, `notInArray`, ...) are imported directly from `drizzle-orm`
 * (declared as an optional peer dependency), so callers don't have to wire
 * them up themselves.
 */

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { createAdapterFactory } from "../adapter-factory";
import type { CleanedWhere, CustomAdapter } from "../adapter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface DrizzleAdapterConfig {
  /** A Drizzle database instance (pg / mysql / sqlite). */
  db: Any;
  /** The Drizzle activity table definition. */
  table: Any;
  /** "postgres" | "mysql" | "sqlite" */
  dialect?: "postgres" | "mysql" | "sqlite";
  debugLogs?: boolean;
}

function buildExpr(c: CleanedWhere, table: Any): Any {
  const col = table[c.field];
  const insensitive =
    c.mode === "insensitive" &&
    (typeof c.value === "string" ||
      (Array.isArray(c.value) && c.value.every((v) => typeof v === "string")));
  switch (c.operator) {
    case "eq":
      return c.value === null ? isNull(col) : eq(col, c.value);
    case "ne":
      return c.value === null ? isNotNull(col) : ne(col, c.value);
    case "lt":
      return lt(col, c.value);
    case "lte":
      return lte(col, c.value);
    case "gt":
      return gt(col, c.value);
    case "gte":
      return gte(col, c.value);
    case "in":
      return inArray(col, Array.isArray(c.value) ? c.value : [c.value]);
    case "not_in":
      return notInArray(col, Array.isArray(c.value) ? c.value : [c.value]);
    case "contains":
      return insensitive
        ? ilike(col, `%${c.value}%`)
        : like(col, `%${c.value}%`);
    case "starts_with":
      return insensitive ? ilike(col, `${c.value}%`) : like(col, `${c.value}%`);
    case "ends_with":
      return insensitive ? ilike(col, `%${c.value}`) : like(col, `%${c.value}`);
    default:
      return eq(col, c.value);
  }
}

function buildWhere(where: CleanedWhere[], table: Any): Any {
  if (where.length === 0) return undefined;
  // Group AND-runs, separated by OR boundaries.
  const groups: Any[][] = [[]];
  for (let i = 0; i < where.length; i++) {
    const c = where[i]!;
    if (i > 0 && c.connector === "OR") groups.push([buildExpr(c, table)]);
    else groups[groups.length - 1]!.push(buildExpr(c, table));
  }
  const ands = groups.map((g) => (g.length === 1 ? g[0] : and(...g)));
  return ands.length === 1 ? ands[0] : or(...ands);
}

export const drizzleAdapter = (config: DrizzleAdapterConfig) => {
  const { db, table, debugLogs } = config;
  return createAdapterFactory({
    config: {
      adapterId: `drizzle-${config.dialect ?? "postgres"}`,
      adapterName: "Drizzle Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: config.dialect !== "sqlite",
      debugLogs,
    },
    adapter: ({ debugLog }): CustomAdapter => ({
      async create({ data }) {
        debugLog("create", data);
        const rows = await db.insert(table).values(data).returning();
        return rows[0];
      },
      async createMany({ data }) {
        if (data.length === 0) return [];
        return db.insert(table).values(data).returning();
      },
      async findOne({ where, select: _select }) {
        const q = db.select().from(table).limit(1);
        const w = buildWhere(where, table);
        const rows = await (w ? q.where(w) : q);
        return (rows[0] ?? null) as never;
      },
      async findMany({ where, limit, sortBy, offset }) {
        let q = db.select().from(table);
        const w = buildWhere(where ?? [], table);
        if (w) q = q.where(w);
        if (sortBy) {
          q = q.orderBy(
            sortBy.direction === "asc"
              ? asc(table[sortBy.field])
              : desc(table[sortBy.field]),
          );
        }
        q = q.limit(Math.max(0, Number(limit) || 100));
        if (offset) q = q.offset(offset);
        return q;
      },
      async count({ where }) {
        let q = db.select({ count: sql`count(*)::int` }).from(table);
        const w = buildWhere(where ?? [], table);
        if (w) q = q.where(w);
        const rows = await q;
        return Number(rows[0]?.count ?? 0);
      },
      async update({ where, update }) {
        let q = db.update(table).set(update);
        const w = buildWhere(where, table);
        if (w) q = q.where(w);
        const rows = await q.returning();
        return (rows[0] ?? null) as never;
      },
      async updateMany({ where, update }) {
        let q = db.update(table).set(update);
        const w = buildWhere(where, table);
        if (w) q = q.where(w);
        const rows = await q.returning();
        return rows.length;
      },
      async delete({ where }) {
        let q = db.delete(table);
        const w = buildWhere(where, table);
        if (w) q = q.where(w);
        await q;
      },
      async deleteMany({ where }) {
        let q = db.delete(table);
        const w = buildWhere(where, table);
        if (w) q = q.where(w);
        const rows = await q.returning();
        return rows.length;
      },
    }),
  });
};

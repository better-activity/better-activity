/**
 * Prisma adapter.
 *
 * Translates `CleanedWhere[]` into Prisma's `where` filter syntax. Caller
 * provides a Prisma client and the model name (e.g. `prisma.activity`).
 *
 * The mapping intentionally exposes Prisma's full set of filters:
 *   eq        →  { equals }
 *   ne        →  { not }
 *   in        →  { in }
 *   not_in    →  { notIn }
 *   contains  →  { contains, mode? }
 *   starts_with → { startsWith, mode? }
 *   ends_with →  { endsWith, mode? }
 *   lt/lte/gt/gte → { lt/lte/gt/gte }
 */

import { createAdapterFactory } from "../adapter-factory";
import type { CleanedWhere, CustomAdapter } from "../adapter";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface PrismaDelegate {
  create: (args: { data: Any; select?: Any }) => Promise<Any>;
  createMany?: (args: { data: Any[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  createManyAndReturn?: (args: { data: Any[] }) => Promise<Any[]>;
  findFirst: (args: { where?: Any; select?: Any; orderBy?: Any }) => Promise<Any>;
  findMany: (args: {
    where?: Any;
    select?: Any;
    orderBy?: Any;
    take?: number;
    skip?: number;
  }) => Promise<Any[]>;
  count: (args: { where?: Any }) => Promise<number>;
  update: (args: { where: Any; data: Any }) => Promise<Any>;
  updateMany: (args: { where: Any; data: Any }) => Promise<{ count: number }>;
  delete: (args: { where: Any }) => Promise<Any>;
  deleteMany: (args: { where: Any }) => Promise<{ count: number }>;
}

export interface PrismaAdapterConfig {
  /** A Prisma delegate, e.g. `prisma.activity`. */
  delegate: PrismaDelegate;
  /** "postgres" | "mysql" | "sqlite" — controls case-insensitive mode support. */
  dialect?: "postgres" | "mysql" | "sqlite";
  debugLogs?: boolean;
}

function clauseToPrisma(c: CleanedWhere, dialect: "postgres" | "mysql" | "sqlite"): Any {
  const supportsMode = dialect === "postgres";
  const insensitive =
    c.mode === "insensitive" &&
    (typeof c.value === "string" ||
      (Array.isArray(c.value) && c.value.every((v) => typeof v === "string")));
  const mode = insensitive && supportsMode ? ({ mode: "insensitive" } as const) : {};

  switch (c.operator) {
    case "eq":
      return { [c.field]: c.value === null ? null : { equals: c.value, ...mode } };
    case "ne":
      return { [c.field]: { not: c.value, ...mode } };
    case "lt":
      return { [c.field]: { lt: c.value } };
    case "lte":
      return { [c.field]: { lte: c.value } };
    case "gt":
      return { [c.field]: { gt: c.value } };
    case "gte":
      return { [c.field]: { gte: c.value } };
    case "in":
      return { [c.field]: { in: Array.isArray(c.value) ? c.value : [c.value] } };
    case "not_in":
      return { [c.field]: { notIn: Array.isArray(c.value) ? c.value : [c.value] } };
    case "contains":
      return { [c.field]: { contains: c.value, ...mode } };
    case "starts_with":
      return { [c.field]: { startsWith: c.value, ...mode } };
    case "ends_with":
      return { [c.field]: { endsWith: c.value, ...mode } };
    default:
      return { [c.field]: c.value };
  }
}

function buildPrismaWhere(
  where: CleanedWhere[],
  dialect: "postgres" | "mysql" | "sqlite",
): Any {
  if (where.length === 0) return undefined;
  const groups: Any[][] = [[]];
  for (let i = 0; i < where.length; i++) {
    const c = where[i]!;
    if (i > 0 && c.connector === "OR") groups.push([clauseToPrisma(c, dialect)]);
    else groups[groups.length - 1]!.push(clauseToPrisma(c, dialect));
  }
  const ands = groups.map((g) => (g.length === 1 ? g[0] : { AND: g }));
  return ands.length === 1 ? ands[0] : { OR: ands };
}

export const prismaAdapter = (config: PrismaAdapterConfig) => {
  const { delegate, debugLogs } = config;
  const dialect = config.dialect ?? "postgres";
  return createAdapterFactory({
    config: {
      adapterId: `prisma-${dialect}`,
      adapterName: "Prisma Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: dialect !== "sqlite",
      debugLogs,
    },
    adapter: ({ debugLog }): CustomAdapter => ({
      async create({ data }) {
        debugLog("create", data);
        return delegate.create({ data });
      },
      async createMany({ data }) {
        if (data.length === 0) return [];
        if (delegate.createManyAndReturn) {
          return delegate.createManyAndReturn({ data });
        }
        // Fallback: sequential.
        const out: Any[] = [];
        for (const d of data) out.push(await delegate.create({ data: d }));
        return out;
      },
      async findOne({ where, select }) {
        return (
          (await delegate.findFirst({
            where: buildPrismaWhere(where, dialect),
            select: select ? Object.fromEntries(select.map((s) => [s, true])) : undefined,
          })) ?? null
        );
      },
      async findMany({ where, limit, sortBy, select, offset }) {
        return delegate.findMany({
          where: buildPrismaWhere(where ?? [], dialect),
          select: select ? Object.fromEntries(select.map((s) => [s, true])) : undefined,
          orderBy: sortBy ? { [sortBy.field]: sortBy.direction } : undefined,
          take: Math.max(0, Number(limit) || 100),
          skip: offset,
        });
      },
      async count({ where }) {
        return delegate.count({ where: buildPrismaWhere(where ?? [], dialect) });
      },
      async update({ where, update }) {
        // Prisma's `update` requires unique where. Fall back to findFirst+update by id.
        const filter = buildPrismaWhere(where, dialect);
        const existing = await delegate.findFirst({ where: filter });
        if (!existing) return null;
        return delegate.update({ where: { id: existing.id }, data: update });
      },
      async updateMany({ where, update }) {
        const res = await delegate.updateMany({
          where: buildPrismaWhere(where, dialect),
          data: update,
        });
        return res.count;
      },
      async delete({ where }) {
        const filter = buildPrismaWhere(where, dialect);
        const existing = await delegate.findFirst({ where: filter });
        if (existing) await delegate.delete({ where: { id: existing.id } });
      },
      async deleteMany({ where }) {
        const res = await delegate.deleteMany({ where: buildPrismaWhere(where, dialect) });
        return res.count;
      },
    }),
  });
};

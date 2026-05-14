/**
 * Kysely adapter.
 *
 * Accepts a `Kysely<DB>` instance where `DB` includes an `activity` (or
 * user-overridden) table matching the canonical schema. We use Kysely's
 * `expressionBuilder` to translate `CleanedWhere` clauses to Kysely's typed
 * AST.
 */

import { createAdapterFactory } from "../adapter-factory";
import type { CleanedWhere, CustomAdapter } from "../adapter";

/**
 * Loose shape of a Kysely instance — we only use a handful of methods.
 * Typed as `any` so callers can pass their fully-typed `Kysely<DB>` without
 * a structural mismatch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KyselyLike = any;

export interface KyselyAdapterConfig {
  db: KyselyLike;
  /** "postgres" | "mysql" | "sqlite" — used for migration generation. */
  dialect?: "postgres" | "mysql" | "sqlite";
  debugLogs?: boolean;
}

function applyWhere(qb: KyselyLike, where: CleanedWhere[]): KyselyLike {
  if (where.length === 0) return qb;
  return qb.where((eb: KyselyLike) => {
    let expr: KyselyLike | null = null;
    for (let i = 0; i < where.length; i++) {
      const c = where[i]!;
      const next = clauseToEB(eb, c);
      if (i === 0) {
        expr = next;
      } else if (c.connector === "OR") {
        expr = eb.or([expr, next]);
      } else {
        expr = eb.and([expr, next]);
      }
    }
    return expr;
  });
}

function clauseToEB(eb: KyselyLike, c: CleanedWhere): KyselyLike {
  const insensitive =
    c.mode === "insensitive" &&
    (typeof c.value === "string" ||
      (Array.isArray(c.value) && c.value.every((v) => typeof v === "string")));
  switch (c.operator) {
    case "eq":
      return c.value === null ? eb(c.field, "is", null) : eb(c.field, "=", c.value);
    case "ne":
      return c.value === null ? eb(c.field, "is not", null) : eb(c.field, "<>", c.value);
    case "lt":
      return eb(c.field, "<", c.value);
    case "lte":
      return eb(c.field, "<=", c.value);
    case "gt":
      return eb(c.field, ">", c.value);
    case "gte":
      return eb(c.field, ">=", c.value);
    case "in":
      return eb(c.field, "in", Array.isArray(c.value) ? c.value : [c.value]);
    case "not_in":
      return eb(c.field, "not in", Array.isArray(c.value) ? c.value : [c.value]);
    case "contains":
      return eb(c.field, insensitive ? "ilike" : "like", `%${c.value}%`);
    case "starts_with":
      return eb(c.field, insensitive ? "ilike" : "like", `${c.value}%`);
    case "ends_with":
      return eb(c.field, insensitive ? "ilike" : "like", `%${c.value}`);
    default:
      return eb(c.field, "=", c.value);
  }
}

export const kyselyAdapter = (config: KyselyAdapterConfig) => {
  const { db, debugLogs } = config;
  return createAdapterFactory({
    config: {
      adapterId: `kysely-${config.dialect ?? "postgres"}`,
      adapterName: "Kysely Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: config.dialect !== "sqlite",
      debugLogs,
    },
    adapter: ({ table, debugLog }): CustomAdapter => ({
      async create({ data }) {
        debugLog("create", data);
        const res = await db
          .insertInto(table.name)
          .values(data)
          .returningAll()
          .executeTakeFirstOrThrow();
        return res;
      },
      async createMany({ data }) {
        if (data.length === 0) return [];
        const res = await db
          .insertInto(table.name)
          .values(data)
          .returningAll()
          .execute();
        return res;
      },
      async findOne({ where, select }) {
        let qb = db.selectFrom(table.name);
        qb = applyWhere(qb, where);
        qb = select?.length ? qb.select(select) : qb.selectAll();
        const r = await qb.limit(1).executeTakeFirst();
        return (r ?? null) as never;
      },
      async findMany({ where, limit, select, sortBy, offset }) {
        let qb = db.selectFrom(table.name);
        qb = applyWhere(qb, where ?? []);
        qb = select?.length ? qb.select(select) : qb.selectAll();
        if (sortBy) qb = qb.orderBy(sortBy.field, sortBy.direction);
        qb = qb.limit(Math.max(0, Number(limit) || 100));
        if (offset) qb = qb.offset(offset);
        const rows = await qb.execute();
        return rows as never;
      },
      async count({ where }) {
        let qb = db.selectFrom(table.name).select((eb: KyselyLike) => eb.fn.countAll().as("count"));
        qb = applyWhere(qb, where ?? []);
        const r = await qb.executeTakeFirst();
        return Number(r?.count ?? 0);
      },
      async update({ where, update }) {
        let qb = db.updateTable(table.name).set(update);
        qb = applyWhere(qb, where);
        const row = await qb.returningAll().executeTakeFirst();
        return (row ?? null) as never;
      },
      async updateMany({ where, update }) {
        let qb = db.updateTable(table.name).set(update);
        qb = applyWhere(qb, where);
        const res = await qb.executeTakeFirst();
        return Number(res?.numUpdatedRows ?? 0);
      },
      async delete({ where }) {
        let qb = db.deleteFrom(table.name);
        qb = applyWhere(qb, where);
        await qb.execute();
      },
      async deleteMany({ where }) {
        let qb = db.deleteFrom(table.name);
        qb = applyWhere(qb, where);
        const res = await qb.executeTakeFirst();
        return Number(res?.numDeletedRows ?? 0);
      },
    }),
  });
};

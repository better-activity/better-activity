/**
 * MySQL adapter (direct `mysql2`).
 *
 * Pass a `mysql2` pool, connection, or anything with `query(sql, values)`
 * returning `[rows]` like `mysql2/promise`.
 */

import { createAdapterFactory } from "../adapter-factory";
import type { CustomAdapter } from "../adapter";
import { generateMySQLSQL } from "../migrations";
import {
  buildBulkInsertQmark,
  buildInsertQmark,
  buildOrderClause,
  buildUpdateQmark,
  buildWhereQmark,
  mysqlQuote as q,
} from "./shared-sql";

export interface MySQLLike {
  query: (
    sql: string,
    values?: unknown[],
  ) => Promise<
    | [unknown[], unknown[]?]
    | { rows: unknown[]; affectedRows?: number; insertId?: number | string }
  >;
}

export interface MySQLAdapterConfig {
  pool: MySQLLike;
  debugLogs?: boolean;
}

function normalizeRows(
  res: Awaited<ReturnType<MySQLLike["query"]>>,
): { rows: Record<string, unknown>[]; affected: number } {
  if (Array.isArray(res)) {
    const rows = res[0] as Record<string, unknown>[] | { affectedRows?: number };
    if (Array.isArray(rows)) {
      return { rows, affected: rows.length };
    }
    return { rows: [], affected: (rows as { affectedRows?: number })?.affectedRows ?? 0 };
  }
  return {
    rows: (res.rows ?? []) as Record<string, unknown>[],
    affected: (res as { affectedRows?: number }).affectedRows ?? 0,
  };
}

export const mysqlAdapter = (config: MySQLAdapterConfig) => {
  const { pool, debugLogs } = config;
  return createAdapterFactory({
    config: {
      adapterId: "mysql",
      adapterName: "MySQL Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: false,
      debugLogs,
    },
    adapter: ({ table, debugLog }): CustomAdapter => ({
      async create({ data }) {
        const { sql, values } = buildInsertQmark(table, data as Record<string, unknown>, q);
        debugLog("create", sql, values);
        await pool.query(sql, values);
        return data;
      },
      async createMany({ data }) {
        if (data.length === 0) return [];
        const { sql, values } = buildBulkInsertQmark(table, data as Record<string, unknown>[], q);
        debugLog("createMany", sql);
        await pool.query(sql, values);
        return data;
      },
      async findOne({ where, select }) {
        const w = buildWhereQmark(where, q);
        const cols = select?.length ? select.map(q).join(", ") : "*";
        const sql = `SELECT ${cols} FROM ${q(table.name)} ${w.sql} LIMIT 1`;
        debugLog("findOne", sql, w.values);
        const res = normalizeRows(await pool.query(sql, w.values));
        return (res.rows[0] ?? null) as never;
      },
      async findMany({ where, limit, select, sortBy, offset }) {
        const w = buildWhereQmark(where ?? [], q);
        const cols = select?.length ? select.map(q).join(", ") : "*";
        const lim = `LIMIT ${Math.max(0, Number(limit) || 100)}`;
        const off = offset ? `OFFSET ${Math.max(0, Number(offset))}` : "";
        const sql = `SELECT ${cols} FROM ${q(table.name)} ${w.sql} ${buildOrderClause(sortBy, q)} ${lim} ${off}`.trim();
        const res = normalizeRows(await pool.query(sql, w.values));
        return res.rows as never;
      },
      async count({ where }) {
        const w = buildWhereQmark(where ?? [], q);
        const sql = `SELECT COUNT(*) AS count FROM ${q(table.name)} ${w.sql}`;
        const res = normalizeRows(await pool.query(sql, w.values));
        return Number((res.rows[0] as { count?: number | string })?.count ?? 0);
      },
      async update({ where, update }) {
        const w = buildWhereQmark(where, q);
        const u = buildUpdateQmark(table, update, w, q);
        await pool.query(u.sql, u.values);
        // MySQL has no RETURNING. Round-trip a SELECT to surface the row.
        const selSql = `SELECT * FROM ${q(table.name)} ${w.sql} LIMIT 1`;
        const sel = normalizeRows(await pool.query(selSql, w.values));
        return (sel.rows[0] ?? null) as never;
      },
      async updateMany({ where, update }) {
        const w = buildWhereQmark(where, q);
        const u = buildUpdateQmark(table, update, w, q);
        const res = normalizeRows(await pool.query(u.sql, u.values));
        return res.affected;
      },
      async delete({ where }) {
        const w = buildWhereQmark(where, q);
        await pool.query(`DELETE FROM ${q(table.name)} ${w.sql}`, w.values);
      },
      async deleteMany({ where }) {
        const w = buildWhereQmark(where, q);
        const res = normalizeRows(await pool.query(`DELETE FROM ${q(table.name)} ${w.sql}`, w.values));
        return res.affected;
      },
      async createSchema({ file }) {
        return {
          code: generateMySQLSQL(table),
          path: file ?? "./migrations/mysql-activity.sql",
        };
      },
    }),
  });
};

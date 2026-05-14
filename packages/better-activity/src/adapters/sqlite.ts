/**
 * SQLite adapter (`better-sqlite3` style — synchronous prepared statements).
 *
 * Accepts anything that exposes `prepare(sql).all(...)`, `.run(...)`, `.get(...)`.
 * Booleans are stored as 0/1 (SQLite has no native boolean), dates as
 * ISO-8601 strings, and JSON as text. The factory handles the round-trip.
 */

import { createAdapterFactory } from "../adapter-factory";
import type { CustomAdapter } from "../adapter";
import { generateSQLiteSQL } from "../migrations";
import {
  buildBulkInsertQmark,
  buildInsertQmark,
  buildOrderClause,
  buildUpdateQmark,
  buildWhereQmark,
  sqliteQuote as q,
} from "./shared-sql";

export interface SQLiteStatement {
  all: (...values: unknown[]) => unknown[];
  get: (...values: unknown[]) => unknown;
  run: (...values: unknown[]) => { changes: number; lastInsertRowid?: number | bigint };
}

export interface SQLiteLike {
  prepare: (sql: string) => SQLiteStatement;
}

export interface SQLiteAdapterConfig {
  db: SQLiteLike;
  debugLogs?: boolean;
}

export const sqliteAdapter = (config: SQLiteAdapterConfig) => {
  const { db, debugLogs } = config;
  return createAdapterFactory({
    config: {
      adapterId: "sqlite",
      adapterName: "SQLite Adapter",
      supportsJSON: false,
      supportsDates: false,
      supportsBooleans: false,
      debugLogs,
    },
    adapter: ({ table, debugLog }): CustomAdapter => ({
      async create({ data }) {
        const { sql, values } = buildInsertQmark(table, data as Record<string, unknown>, q);
        debugLog("create", sql, values);
        db.prepare(sql).run(...values);
        return data;
      },
      async createMany({ data }) {
        if (data.length === 0) return [];
        const { sql, values } = buildBulkInsertQmark(table, data as Record<string, unknown>[], q);
        debugLog("createMany", sql);
        db.prepare(sql).run(...values);
        return data;
      },
      async findOne({ where, select }) {
        const w = buildWhereQmark(where, q);
        const cols = select?.length ? select.map(q).join(", ") : "*";
        const sql = `SELECT ${cols} FROM ${q(table.name)} ${w.sql} LIMIT 1`;
        debugLog("findOne", sql, w.values);
        const row = db.prepare(sql).get(...w.values) as Record<string, unknown> | undefined;
        return (row ?? null) as never;
      },
      async findMany({ where, limit, select, sortBy, offset }) {
        const w = buildWhereQmark(where ?? [], q);
        const cols = select?.length ? select.map(q).join(", ") : "*";
        const lim = `LIMIT ${Math.max(0, Number(limit) || 100)}`;
        const off = offset ? `OFFSET ${Math.max(0, Number(offset))}` : "";
        const sql = `SELECT ${cols} FROM ${q(table.name)} ${w.sql} ${buildOrderClause(sortBy, q)} ${lim} ${off}`.trim();
        const rows = db.prepare(sql).all(...w.values) as Record<string, unknown>[];
        return rows as never;
      },
      async count({ where }) {
        const w = buildWhereQmark(where ?? [], q);
        const sql = `SELECT COUNT(*) AS count FROM ${q(table.name)} ${w.sql}`;
        const row = db.prepare(sql).get(...w.values) as { count?: number | bigint } | undefined;
        return Number(row?.count ?? 0);
      },
      async update({ where, update }) {
        const w = buildWhereQmark(where, q);
        const u = buildUpdateQmark(table, update, w, q);
        db.prepare(u.sql).run(...u.values);
        const sel = db
          .prepare(`SELECT * FROM ${q(table.name)} ${w.sql} LIMIT 1`)
          .get(...w.values) as Record<string, unknown> | undefined;
        return (sel ?? null) as never;
      },
      async updateMany({ where, update }) {
        const w = buildWhereQmark(where, q);
        const u = buildUpdateQmark(table, update, w, q);
        const res = db.prepare(u.sql).run(...u.values);
        return res.changes;
      },
      async delete({ where }) {
        const w = buildWhereQmark(where, q);
        db.prepare(`DELETE FROM ${q(table.name)} ${w.sql}`).run(...w.values);
      },
      async deleteMany({ where }) {
        const w = buildWhereQmark(where, q);
        const res = db
          .prepare(`DELETE FROM ${q(table.name)} ${w.sql}`)
          .run(...w.values);
        return res.changes;
      },
      async createSchema({ file }) {
        return {
          code: generateSQLiteSQL(table),
          path: file ?? "./migrations/sqlite-activity.sql",
        };
      },
    }),
  });
};

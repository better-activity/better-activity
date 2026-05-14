/**
 * PostgreSQL adapter (direct `pg`).
 *
 * Accepts a `pg.Pool` (or anything with the same `query()` shape) so the
 * caller can plug in their existing connection. Schema columns use the
 * camelCase names defined in `getActivityTable`; identifiers are quoted so
 * Postgres preserves the casing.
 */

import { createAdapterFactory } from "../adapter-factory";
import type {
  CleanedWhere,
  CustomAdapter,
  SortBy,
  WhereOperator,
} from "../adapter";
import { generatePostgresSQL } from "../migrations";
import type { ActivityTableSchema } from "../schema";

/** Minimal `pg.Pool` shape (so we don't take a build-time dep on `pg`). */
export interface PostgresPool {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export interface PostgresAdapterConfig {
  /** Use `pg.Pool` (or compatible). */
  pool: PostgresPool;
  /**
   * When true, the adapter passes `JSON.stringify(metadata)` to Postgres.
   * `pg` will then bind it as a JSONB literal. Default: true.
   */
  serializeJSON?: boolean;
  debugLogs?: boolean;
}

function q(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

function placeholders(start: number, n: number): string {
  const xs: string[] = [];
  for (let i = 0; i < n; i++) xs.push(`$${start + i}`);
  return xs.join(", ");
}

function operatorToSQL(
  op: WhereOperator,
  insensitive: boolean,
): { left: (col: string) => string; right: string; cmp: string } {
  switch (op) {
    case "eq":
      return insensitive
        ? { left: (c) => `LOWER(${c})`, right: "LOWER($P)", cmp: "=" }
        : { left: (c) => c, right: "$P", cmp: "=" };
    case "ne":
      return insensitive
        ? { left: (c) => `LOWER(${c})`, right: "LOWER($P)", cmp: "<>" }
        : { left: (c) => c, right: "$P", cmp: "<>" };
    case "lt":
      return { left: (c) => c, right: "$P", cmp: "<" };
    case "lte":
      return { left: (c) => c, right: "$P", cmp: "<=" };
    case "gt":
      return { left: (c) => c, right: "$P", cmp: ">" };
    case "gte":
      return { left: (c) => c, right: "$P", cmp: ">=" };
    case "in":
      return { left: (c) => c, right: "$P", cmp: "= ANY" };
    case "not_in":
      return { left: (c) => c, right: "$P", cmp: "<> ALL" };
    case "contains":
      return insensitive
        ? { left: (c) => c, right: "$P", cmp: "ILIKE_CONTAINS" }
        : { left: (c) => c, right: "$P", cmp: "LIKE_CONTAINS" };
    case "starts_with":
      return insensitive
        ? { left: (c) => c, right: "$P", cmp: "ILIKE_STARTS" }
        : { left: (c) => c, right: "$P", cmp: "LIKE_STARTS" };
    case "ends_with":
      return insensitive
        ? { left: (c) => c, right: "$P", cmp: "ILIKE_ENDS" }
        : { left: (c) => c, right: "$P", cmp: "LIKE_ENDS" };
    default:
      return { left: (c) => c, right: "$P", cmp: "=" };
  }
}

interface BuiltWhere {
  sql: string;
  values: unknown[];
}

/**
 * Compile `where: CleanedWhere[]` to a parameterized Postgres WHERE
 * fragment. Each clause's `connector` joins it to the prior clause.
 */
function buildWhere(where: CleanedWhere[], offsetIdx = 1): BuiltWhere {
  if (where.length === 0) return { sql: "", values: [] };
  const parts: string[] = [];
  const values: unknown[] = [];
  let idx = offsetIdx;
  for (let i = 0; i < where.length; i++) {
    const c = where[i]!;
    const insensitive =
      c.mode === "insensitive" &&
      (typeof c.value === "string" ||
        (Array.isArray(c.value) && c.value.every((v) => typeof v === "string")));

    let fragment = "";

    if (c.operator === "eq" && c.value === null) {
      fragment = `${q(c.field)} IS NULL`;
    } else if (c.operator === "ne" && c.value === null) {
      fragment = `${q(c.field)} IS NOT NULL`;
    } else {
      const desc = operatorToSQL(c.operator, insensitive);
      const left = desc.left(q(c.field));
      switch (desc.cmp) {
        case "= ANY": {
          values.push(c.value);
          fragment = `${left} = ANY($${idx++})`;
          break;
        }
        case "<> ALL": {
          values.push(c.value);
          fragment = `${left} <> ALL($${idx++})`;
          break;
        }
        case "LIKE_CONTAINS":
        case "ILIKE_CONTAINS": {
          values.push(`%${String(c.value)}%`);
          fragment = `${left} ${desc.cmp === "ILIKE_CONTAINS" ? "ILIKE" : "LIKE"} $${idx++}`;
          break;
        }
        case "LIKE_STARTS":
        case "ILIKE_STARTS": {
          values.push(`${String(c.value)}%`);
          fragment = `${left} ${desc.cmp === "ILIKE_STARTS" ? "ILIKE" : "LIKE"} $${idx++}`;
          break;
        }
        case "LIKE_ENDS":
        case "ILIKE_ENDS": {
          values.push(`%${String(c.value)}`);
          fragment = `${left} ${desc.cmp === "ILIKE_ENDS" ? "ILIKE" : "LIKE"} $${idx++}`;
          break;
        }
        default: {
          values.push(c.value);
          const rhs = insensitive ? `LOWER($${idx++})` : `$${idx++}`;
          fragment = `${left} ${desc.cmp} ${rhs}`;
        }
      }
    }

    if (i === 0) {
      parts.push(fragment);
    } else {
      parts.push(`${c.connector} ${fragment}`);
    }
  }

  return { sql: `WHERE ${parts.join(" ")}`, values };
}

function orderClause(sortBy: SortBy | undefined): string {
  if (!sortBy) return "";
  return `ORDER BY ${q(sortBy.field)} ${sortBy.direction === "asc" ? "ASC" : "DESC"}`;
}

function insertSQL(
  schema: ActivityTableSchema,
  row: Record<string, unknown>,
): { sql: string; values: unknown[] } {
  const cols: string[] = [];
  const values: unknown[] = [];
  for (const f of schema.fields) {
    if (row[f.name] === undefined) continue;
    cols.push(f.name);
    let v = row[f.name];
    if (f.type === "json" && v != null && typeof v !== "string") {
      v = JSON.stringify(v);
    }
    values.push(v);
  }
  const sql = `INSERT INTO ${q(schema.name)} (${cols.map(q).join(", ")}) VALUES (${placeholders(1, cols.length)}) RETURNING *`;
  return { sql, values };
}

function updateSQL(
  schema: ActivityTableSchema,
  update: Record<string, unknown>,
  where: BuiltWhere,
  startIdx: number,
): { sql: string; values: unknown[] } {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = startIdx;
  for (const [k, v] of Object.entries(update)) {
    const f = schema.fields.find((f) => f.name === k);
    let val = v;
    if (f?.type === "json" && val != null && typeof val !== "string") {
      val = JSON.stringify(val);
    }
    sets.push(`${q(k)} = $${i++}`);
    values.push(val);
  }
  const sql = `UPDATE ${q(schema.name)} SET ${sets.join(", ")} ${where.sql} RETURNING *`;
  return { sql, values: [...values, ...where.values] };
}

export const postgresAdapter = (config: PostgresAdapterConfig) => {
  const { pool, debugLogs } = config;
  return createAdapterFactory({
    config: {
      adapterId: "postgres",
      adapterName: "Postgres Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      debugLogs,
    },
    adapter: ({ table, debugLog }): CustomAdapter => ({
      async create({ data }) {
        const { sql, values } = insertSQL(table, data as Record<string, unknown>);
        debugLog("create", sql, values);
        const res = await pool.query(sql, values);
        return res.rows[0] as never;
      },

      async createMany({ data }) {
        if (data.length === 0) return [];
        // Single multi-VALUES insert. Bulk-friendly.
        const cols = table.fields
          .filter((f) => data.some((d) => (d as Record<string, unknown>)[f.name] !== undefined))
          .map((f) => f.name);
        const rows: string[] = [];
        const values: unknown[] = [];
        let idx = 1;
        for (const d of data as Record<string, unknown>[]) {
          const ph: string[] = [];
          for (const c of cols) {
            const f = table.fields.find((ff) => ff.name === c)!;
            let v = d[c];
            if (f.type === "json" && v != null && typeof v !== "string") {
              v = JSON.stringify(v);
            }
            values.push(v ?? null);
            ph.push(`$${idx++}`);
          }
          rows.push(`(${ph.join(", ")})`);
        }
        const sql = `INSERT INTO ${q(table.name)} (${cols.map(q).join(", ")}) VALUES ${rows.join(", ")} RETURNING *`;
        debugLog("createMany", sql);
        const res = await pool.query(sql, values);
        return res.rows as never;
      },

      async findOne({ where, select }) {
        const w = buildWhere(where);
        const cols = select?.length ? select.map(q).join(", ") : "*";
        const sql = `SELECT ${cols} FROM ${q(table.name)} ${w.sql} LIMIT 1`;
        debugLog("findOne", sql, w.values);
        const res = await pool.query(sql, w.values);
        return (res.rows[0] ?? null) as never;
      },

      async findMany({ where, limit, select, sortBy, offset }) {
        const w = buildWhere(where ?? []);
        const cols = select?.length ? select.map(q).join(", ") : "*";
        const lim = `LIMIT ${Math.max(0, Number(limit) || 100)}`;
        const off = offset ? `OFFSET ${Math.max(0, Number(offset))}` : "";
        const sql = `SELECT ${cols} FROM ${q(table.name)} ${w.sql} ${orderClause(sortBy)} ${lim} ${off}`.trim();
        debugLog("findMany", sql, w.values);
        const res = await pool.query(sql, w.values);
        return res.rows as never;
      },

      async count({ where }) {
        const w = buildWhere(where ?? []);
        const sql = `SELECT COUNT(*)::int AS count FROM ${q(table.name)} ${w.sql}`;
        debugLog("count", sql, w.values);
        const res = await pool.query(sql, w.values);
        const first = res.rows[0] as { count?: number } | undefined;
        return Number(first?.count ?? 0);
      },

      async update({ where, update }) {
        const w = buildWhere(where, Object.keys(update).length + 1);
        const built = updateSQL(table, update, w, 1);
        debugLog("update", built.sql);
        const res = await pool.query(built.sql, built.values);
        return (res.rows[0] ?? null) as never;
      },

      async updateMany({ where, update }) {
        const w = buildWhere(where, Object.keys(update).length + 1);
        const built = updateSQL(table, update, w, 1);
        const res = await pool.query(built.sql, built.values);
        return res.rowCount ?? 0;
      },

      async delete({ where }) {
        const w = buildWhere(where);
        const sql = `DELETE FROM ${q(table.name)} ${w.sql}`;
        debugLog("delete", sql, w.values);
        await pool.query(sql, w.values);
      },

      async deleteMany({ where }) {
        const w = buildWhere(where);
        const sql = `DELETE FROM ${q(table.name)} ${w.sql}`;
        const res = await pool.query(sql, w.values);
        return res.rowCount ?? 0;
      },

      async createSchema({ file }) {
        return {
          code: generatePostgresSQL(table),
          path: file ?? "./migrations/postgres-activity.sql",
        };
      },
    }),
  });
};

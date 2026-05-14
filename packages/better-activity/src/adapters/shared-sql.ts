/**
 * Shared SQL helpers used by direct SQL adapters (Postgres / MySQL / SQLite).
 *
 * Postgres has its own bespoke builder because we use named placeholders
 * (`$1`, `$2`, …) and want `RETURNING *`. MySQL and SQLite use `?` for
 * placeholders; this file's helpers cover both.
 */

import type { CleanedWhere, SortBy, WhereOperator } from "../adapter";
import type { ActivityTableSchema } from "../schema";

export type QuoteFn = (id: string) => string;

export interface QmarkSQL {
  sql: string;
  values: unknown[];
}

interface OpDescriptor {
  cmp: string;
  insensitive: boolean;
  /** For LIKE-family operators, the value template, e.g. `"%{}"`. */
  template?: string;
  /** For IN / NOT IN. */
  isList?: boolean;
}

function operatorDescriptor(
  op: WhereOperator,
  insensitive: boolean,
): OpDescriptor {
  switch (op) {
    case "eq":
      return { cmp: "=", insensitive };
    case "ne":
      return { cmp: "<>", insensitive };
    case "lt":
      return { cmp: "<", insensitive: false };
    case "lte":
      return { cmp: "<=", insensitive: false };
    case "gt":
      return { cmp: ">", insensitive: false };
    case "gte":
      return { cmp: ">=", insensitive: false };
    case "in":
      return { cmp: "IN", insensitive, isList: true };
    case "not_in":
      return { cmp: "NOT IN", insensitive, isList: true };
    case "contains":
      return { cmp: insensitive ? "LIKE" : "LIKE", insensitive, template: "%{}%" };
    case "starts_with":
      return { cmp: insensitive ? "LIKE" : "LIKE", insensitive, template: "{}%" };
    case "ends_with":
      return { cmp: insensitive ? "LIKE" : "LIKE", insensitive, template: "%{}" };
  }
}

/**
 * `?`-placeholder where-clause builder. Wraps both sides in `LOWER(...)` for
 * insensitive comparisons (MySQL/SQLite). Pass `dialect` to control behaviour.
 */
export function buildWhereQmark(
  where: CleanedWhere[],
  q: QuoteFn,
): QmarkSQL {
  if (where.length === 0) return { sql: "", values: [] };
  const parts: string[] = [];
  const values: unknown[] = [];
  for (let i = 0; i < where.length; i++) {
    const c = where[i]!;
    const isStr =
      typeof c.value === "string" ||
      (Array.isArray(c.value) && c.value.every((v) => typeof v === "string"));
    const insensitive = c.mode === "insensitive" && isStr;
    const desc = operatorDescriptor(c.operator, insensitive);
    const col = insensitive ? `LOWER(${q(c.field)})` : q(c.field);

    let fragment: string;

    if (c.operator === "eq" && c.value === null) {
      fragment = `${q(c.field)} IS NULL`;
    } else if (c.operator === "ne" && c.value === null) {
      fragment = `${q(c.field)} IS NOT NULL`;
    } else if (desc.isList) {
      const arr = Array.isArray(c.value) ? c.value : [c.value];
      if (arr.length === 0) {
        // Empty IN list → always false; empty NOT IN → always true.
        fragment = c.operator === "in" ? "1=0" : "1=1";
      } else {
        const ph = arr.map(() => "?").join(", ");
        fragment = `${col} ${desc.cmp} (${ph})`;
        for (const v of arr) values.push(insensitive ? String(v).toLowerCase() : v);
      }
    } else if (desc.template) {
      const v = desc.template.replace("{}", String(c.value));
      fragment = `${col} ${desc.cmp} ?`;
      values.push(insensitive ? v.toLowerCase() : v);
    } else {
      const rhs = insensitive ? "LOWER(?)" : "?";
      fragment = `${col} ${desc.cmp} ${rhs}`;
      values.push(c.value);
    }

    parts.push(i === 0 ? fragment : `${c.connector} ${fragment}`);
  }

  return { sql: `WHERE ${parts.join(" ")}`, values };
}

export function buildOrderClause(
  sortBy: SortBy | undefined,
  q: QuoteFn,
): string {
  if (!sortBy) return "";
  return `ORDER BY ${q(sortBy.field)} ${sortBy.direction === "asc" ? "ASC" : "DESC"}`;
}

export function buildInsertQmark(
  schema: ActivityTableSchema,
  row: Record<string, unknown>,
  q: QuoteFn,
): QmarkSQL {
  const cols: string[] = [];
  const values: unknown[] = [];
  const ph: string[] = [];
  for (const f of schema.fields) {
    if (row[f.name] === undefined) continue;
    cols.push(q(f.name));
    let v = row[f.name];
    if (f.type === "json" && v != null && typeof v !== "string") {
      v = JSON.stringify(v);
    }
    values.push(v);
    ph.push("?");
  }
  return {
    sql: `INSERT INTO ${q(schema.name)} (${cols.join(", ")}) VALUES (${ph.join(", ")})`,
    values,
  };
}

export function buildBulkInsertQmark(
  schema: ActivityTableSchema,
  rows: Record<string, unknown>[],
  q: QuoteFn,
): QmarkSQL {
  if (rows.length === 0) return { sql: "", values: [] };
  const cols = schema.fields
    .filter((f) => rows.some((r) => r[f.name] !== undefined))
    .map((f) => f.name);
  const values: unknown[] = [];
  const tuples: string[] = [];
  for (const r of rows) {
    const ph: string[] = [];
    for (const c of cols) {
      const f = schema.fields.find((ff) => ff.name === c)!;
      let v = r[c];
      if (f.type === "json" && v != null && typeof v !== "string") {
        v = JSON.stringify(v);
      }
      values.push(v ?? null);
      ph.push("?");
    }
    tuples.push(`(${ph.join(", ")})`);
  }
  return {
    sql: `INSERT INTO ${q(schema.name)} (${cols.map(q).join(", ")}) VALUES ${tuples.join(", ")}`,
    values,
  };
}

export function buildUpdateQmark(
  schema: ActivityTableSchema,
  update: Record<string, unknown>,
  where: QmarkSQL,
  q: QuoteFn,
): QmarkSQL {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(update)) {
    const f = schema.fields.find((ff) => ff.name === k);
    let val = v;
    if (f?.type === "json" && val != null && typeof val !== "string") {
      val = JSON.stringify(val);
    }
    sets.push(`${q(k)} = ?`);
    values.push(val);
  }
  return {
    sql: `UPDATE ${q(schema.name)} SET ${sets.join(", ")} ${where.sql}`,
    values: [...values, ...where.values],
  };
}

export const mysqlQuote: QuoteFn = (id) => `\`${id.replace(/`/g, "``")}\``;
export const sqliteQuote: QuoteFn = (id) => `"${id.replace(/"/g, '""')}"`;

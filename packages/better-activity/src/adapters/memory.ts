/**
 * In-memory adapter. Useful for tests, prototyping, and serverless cold
 * paths where you don't want to persist activity at all (e.g. local dev).
 *
 * Implements every `CleanedWhere` operator and supports `mode: "insensitive"`
 * for string comparisons.
 */

import { createAdapterFactory } from "../adapter-factory";
import type { CleanedWhere, CustomAdapter, SortBy } from "../adapter";

export interface MemoryStore {
  [model: string]: Record<string, unknown>[];
}

export interface MemoryAdapterConfig {
  debugLogs?: boolean;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v);
}

function evalClause(
  record: Record<string, unknown>,
  clause: CleanedWhere,
): boolean {
  const { field, value, operator, mode } = clause;
  const lhs = record[field];
  const insensitive =
    mode === "insensitive" &&
    (typeof value === "string" ||
      (Array.isArray(value) && value.every((v) => typeof v === "string")));

  const eq = (a: unknown, b: unknown): boolean => {
    if (insensitive) return asString(a).toLowerCase() === asString(b).toLowerCase();
    if (b === null) return a == null;
    return a === b;
  };

  switch (operator) {
    case "eq":
      return eq(lhs, value);
    case "ne":
      return !eq(lhs, value);
    case "lt":
      return value != null && lhs != null && (lhs as never) < (value as never);
    case "lte":
      return value != null && lhs != null && (lhs as never) <= (value as never);
    case "gt":
      return value != null && lhs != null && (lhs as never) > (value as never);
    case "gte":
      return value != null && lhs != null && (lhs as never) >= (value as never);
    case "in":
      if (!Array.isArray(value)) return false;
      return insensitive
        ? value.some((v) => asString(v).toLowerCase() === asString(lhs).toLowerCase())
        : (value as unknown[]).includes(lhs);
    case "not_in":
      if (!Array.isArray(value)) return false;
      return insensitive
        ? !value.some((v) => asString(v).toLowerCase() === asString(lhs).toLowerCase())
        : !(value as unknown[]).includes(lhs);
    case "contains": {
      const l = insensitive ? asString(lhs).toLowerCase() : asString(lhs);
      const r = insensitive ? asString(value).toLowerCase() : asString(value);
      return l.includes(r);
    }
    case "starts_with": {
      const l = insensitive ? asString(lhs).toLowerCase() : asString(lhs);
      const r = insensitive ? asString(value).toLowerCase() : asString(value);
      return l.startsWith(r);
    }
    case "ends_with": {
      const l = insensitive ? asString(lhs).toLowerCase() : asString(lhs);
      const r = insensitive ? asString(value).toLowerCase() : asString(value);
      return l.endsWith(r);
    }
    default:
      return false;
  }
}

/**
 * Fold a flat array of clauses according to each clause's `connector`. The
 * connector of the first clause is ignored. Identical to the strategy used
 * by `better-auth`'s memory adapter.
 */
function matches(record: Record<string, unknown>, where: CleanedWhere[]): boolean {
  if (where.length === 0) return true;
  let result = evalClause(record, where[0]!);
  for (let i = 1; i < where.length; i++) {
    const r = evalClause(record, where[i]!);
    if (where[i]!.connector === "OR") result = result || r;
    else result = result && r;
  }
  return result;
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return asString(a).localeCompare(asString(b));
}

function sortRecords(
  records: Record<string, unknown>[],
  sortBy: SortBy | undefined,
): Record<string, unknown>[] {
  if (!sortBy) return records;
  const sorted = [...records].sort((a, b) =>
    compare(a[sortBy.field], b[sortBy.field]),
  );
  return sortBy.direction === "desc" ? sorted.reverse() : sorted;
}

function projectSelect(
  records: Record<string, unknown>[],
  select: string[] | undefined,
): Record<string, unknown>[] {
  if (!select || select.length === 0) return records;
  return records.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => select.includes(k))),
  );
}

export const memoryAdapter = (
  store: MemoryStore = {},
  config: MemoryAdapterConfig = {},
) => {
  return createAdapterFactory({
    config: {
      adapterId: "memory",
      adapterName: "Memory Adapter",
      supportsJSON: true,
      supportsDates: true,
      supportsBooleans: true,
      debugLogs: config.debugLogs,
    },
    adapter: (): CustomAdapter => {
      function table(model: string): Record<string, unknown>[] {
        if (!store[model]) store[model] = [];
        return store[model]!;
      }
      return {
        async create({ model, data }) {
          table(model).push(data);
          return data;
        },
        async createMany({ model, data }) {
          for (const d of data) table(model).push(d);
          return data;
        },
        async findOne({ model, where, select }) {
          const t = table(model);
          const first = t.find((r) => matches(r, where));
          if (!first) return null;
          const [picked] = projectSelect([first], select);
          return picked as never;
        },
        async findMany({ model, where, limit, select, sortBy, offset }) {
          let t = table(model).filter((r) => matches(r, where ?? []));
          t = sortRecords(t, sortBy);
          if (offset) t = t.slice(offset);
          if (limit) t = t.slice(0, limit);
          return projectSelect(t, select) as never;
        },
        async count({ model, where }) {
          if (!where || where.length === 0) return table(model).length;
          return table(model).filter((r) => matches(r, where)).length;
        },
        async update({ model, where, update }) {
          const target = table(model).find((r) => matches(r, where));
          if (!target) return null;
          Object.assign(target, update);
          return target as never;
        },
        async updateMany({ model, where, update }) {
          let count = 0;
          for (const r of table(model)) {
            if (matches(r, where)) {
              Object.assign(r, update);
              count++;
            }
          }
          return count;
        },
        async delete({ model, where }) {
          store[model] = table(model).filter((r) => !matches(r, where));
        },
        async deleteMany({ model, where }) {
          const before = table(model).length;
          store[model] = table(model).filter((r) => !matches(r, where));
          return before - store[model]!.length;
        },
      };
    },
  });
};

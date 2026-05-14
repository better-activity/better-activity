/**
 * Stable, serializable query-key derivation.
 *
 * Two queries that differ only in the order of their `actions` array (or by
 * `undefined` vs missing fields) MUST produce the same key so the cache
 * dedupes correctly. We achieve that by:
 *
 *  - stripping `undefined` values,
 *  - sorting array fields (`actions`) deterministically,
 *  - JSON-stringifying with sorted object keys.
 */

import type { ActivityQuery } from "./types";

/** Drop `undefined` fields and sort arrays whose order is semantically irrelevant. */
export function normalizeQuery(query: ActivityQuery): ActivityQuery {
  const out: ActivityQuery = {};
  for (const k of [
    "entity",
    "entityId",
    "actorId",
    "after",
    "before",
    "limit",
    "cursor",
    "sortBy",
  ] as const) {
    const v = query[k];
    if (v !== undefined && v !== null) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  if (query.actions && query.actions.length > 0) {
    out.actions = [...query.actions].sort();
  }
  return out;
}

function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const parts = sortedKeys(obj).map(
    (k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`,
  );
  return `{${parts.join(",")}}`;
}

/**
 * Returns a canonical string for the given query. Identical queries always
 * produce identical keys; differently-ordered field declarations are
 * normalized away.
 *
 * Cursor is intentionally excluded so paginated requests share a key.
 */
export function activityQueryKey(query: ActivityQuery): string {
  const norm = normalizeQuery(query);
  const { cursor, ...rest } = norm;
  void cursor;
  return stableStringify(rest);
}

/** Predicate: does an activity record match a query? */
export function matchesQuery(
  query: ActivityQuery,
  record: {
    entity: string;
    entityId: string;
    action: string;
    actorId: string | null;
    createdAt: Date | string;
  },
): boolean {
  if (query.entity && query.entity !== record.entity) return false;
  if (query.entityId && query.entityId !== record.entityId) return false;
  if (query.actorId && query.actorId !== record.actorId) return false;
  if (query.actions && !query.actions.includes(record.action)) return false;
  if (query.after) {
    const t = record.createdAt instanceof Date
      ? record.createdAt.getTime()
      : new Date(record.createdAt).getTime();
    if (t < new Date(query.after).getTime()) return false;
  }
  if (query.before) {
    const t = record.createdAt instanceof Date
      ? record.createdAt.getTime()
      : new Date(record.createdAt).getTime();
    if (t >= new Date(query.before).getTime()) return false;
  }
  return true;
}

/**
 * Formatters and small helpers for rendering activity records.
 *
 * - `defineFormatters` — typed-per-entity formatter map.
 * - `defaultFormatters` — minimal fallback producing generic strings.
 * - `formatRelativeTime` — zero-dep relative time formatter.
 * - `groupActivity` — bucket records by day / entity / actor.
 */

import type {
  ActivityGroup,
  DefaultActivityRecord,
  FormatterContext,
  Formatters,
} from "./types";
import type {
  ActionOf,
  ActivityRecord,
  BetterActivity,
  EntitiesConfig,
  EntityName,
} from "better-activity";

// ---------------------------------------------------------------------------
// defineFormatters
// ---------------------------------------------------------------------------

/**
 * Typed formatter-map builder. Pass a `BetterActivity` type (or `typeof
 * activity`) and TypeScript will narrow the keys to your entities and each
 * entity's actions:
 *
 * ```ts
 * const formatters = defineFormatters<typeof activity>({
 *   user: {
 *     logged_in: (r) => ({ title: `${r.actorId} signed in` }),
 *     // ✗ TypeScript error — "archived" is not a user action
 *     archived: (r) => ({ title: "…" }),
 *   },
 * })
 * ```
 *
 * The unconstrained form (`defineFormatters(map)`) also works and returns
 * a `Formatters` typed against `DefaultActivityRecord`.
 */
export function defineFormatters<TActivity = unknown>(
  map: TypedFormatters<TActivity>,
): Formatters<InferRec<TActivity>> {
  return map as unknown as Formatters<InferRec<TActivity>>;
}

// Helper type: discriminated record across all entities.
type InferRec<TActivity> = TActivity extends BetterActivity<infer E>
  ? E extends EntitiesConfig
    ? { [K in EntityName<E>]: ActivityRecord<E, K> }[EntityName<E>]
    : DefaultActivityRecord
  : DefaultActivityRecord;

/** Per-entity, per-action formatter map keyed by the inferred config. */
export type TypedFormatters<TActivity> = TActivity extends BetterActivity<infer E>
  ? E extends EntitiesConfig
    ? {
        [K in EntityName<E>]?: {
          [A in ActionOf<E, K> & string]?: (
            record: ActivityRecord<E, K>,
          ) => Partial<FormatterContext<ActivityRecord<E, K>>>;
        };
      } & {
        default?: (
          record: InferRec<TActivity>,
        ) => Partial<FormatterContext<InferRec<TActivity>>>;
      }
    : Formatters<DefaultActivityRecord>
  : Formatters<DefaultActivityRecord>;

// ---------------------------------------------------------------------------
// Default formatter
// ---------------------------------------------------------------------------

interface MinimalRecord {
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  createdAt: Date | string;
}

/** Built-in formatters covering "ok, what should I show?" by default. */
export const defaultFormatters: Formatters<DefaultActivityRecord> = (() => {
  const map: Formatters<DefaultActivityRecord> = {};
  map.default = (record) => {
    const r = record as unknown as MinimalRecord;
    return {
      actor: r.actorId ?? "system",
      title: `${r.actorId ?? "system"} ${humanize(r.action)} ${r.entity}:${r.entityId}`,
      description: humanize(r.action),
    };
  };
  return map;
})();

function humanize(action: string): string {
  return action.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// resolveFormatter
// ---------------------------------------------------------------------------

/**
 * Walk the formatter map and produce a fully populated `FormatterContext`.
 * Lookup order: `formatters[entity][action]` → `formatters.default` →
 * `defaultFormatters.default`. Each layer fills in fields the previous
 * layer left out.
 */
export function resolveFormatter<TRecord = DefaultActivityRecord>(
  record: TRecord,
  formatters: Formatters<TRecord> | undefined,
  now: Date = new Date(),
): FormatterContext<TRecord> {
  const r = record as unknown as MinimalRecord;
  const layers: Array<Partial<FormatterContext<TRecord>>> = [];

  // Look up the entity-specific action map. The `default` key is special
  // and stores a function rather than an action map; skip it here.
  const entityEntry =
    r.entity !== "default" ? formatters?.[r.entity] : undefined;
  if (entityEntry && typeof entityEntry === "object") {
    const actionMap = entityEntry as Record<
      string,
      (record: TRecord) => Partial<FormatterContext<TRecord>>
    >;
    const specific = actionMap[r.action];
    if (specific) layers.push(specific(record));
  }
  if (formatters?.default) layers.push(formatters.default(record));
  layers.push(defaultFormatters.default!(record as never) as Partial<FormatterContext<TRecord>>);

  const merged: FormatterContext<TRecord> = {
    record,
    actor: pick("actor", layers) ?? r.actorId ?? "system",
    title: pick("title", layers) ?? "",
    description: pick("description", layers) ?? humanize(r.action),
    timeAgo: pick("timeAgo", layers) ?? formatRelativeTime(r.createdAt, now),
    icon: pick("icon", layers) ?? null,
  };
  return merged;
}

function pick<K extends keyof FormatterContext<unknown>>(
  key: K,
  layers: Array<Partial<FormatterContext<unknown>>>,
): FormatterContext<unknown>[K] | undefined {
  for (const l of layers) {
    if (l[key] !== undefined) return l[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

/**
 * Zero-dependency relative-time formatter. Uses `Intl.RelativeTimeFormat`
 * when available, falls back to English-only strings otherwise.
 *
 * @param input  - `Date` or ISO-8601 string.
 * @param now    - Override the "current time" reference (for tests).
 * @param locale - BCP-47 language tag.
 */
export function formatRelativeTime(
  input: Date | string,
  now: Date = new Date(),
  locale = "en",
): string {
  const date = input instanceof Date ? input : new Date(input);
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);

  if (abs < 5) return "just now";

  for (const [unit, secondsPerUnit] of RELATIVE_UNITS) {
    if (abs >= secondsPerUnit || unit === "second") {
      const value = Math.round(diffSec / secondsPerUnit);
      try {
        const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
        return rtf.format(value, unit);
      } catch {
        const sign = value < 0 ? "ago" : "from now";
        return `${Math.abs(value)} ${unit}${Math.abs(value) === 1 ? "" : "s"} ${sign}`;
      }
    }
  }
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// groupActivity
// ---------------------------------------------------------------------------

export type GroupBy = "day" | "entity" | "actor";

/**
 * Bucket records by day / entity / actor for sectioned lists.
 *
 * The order of returned groups follows the order in which keys first
 * appear in the input — preserving the caller's sort.
 */
export function groupActivity<TRecord extends Partial<MinimalRecord>>(
  records: ReadonlyArray<TRecord>,
  by: GroupBy,
): ActivityGroup<TRecord>[] {
  const groups = new Map<string, TRecord[]>();
  for (const r of records) {
    const key = groupKey(r, by);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(r);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: groupLabel(key, by),
    items,
  }));
}

function groupKey<T extends Partial<MinimalRecord>>(r: T, by: GroupBy): string {
  switch (by) {
    case "day": {
      const d = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt ?? 0);
      return d.toISOString().slice(0, 10);
    }
    case "entity":
      return r.entity ?? "unknown";
    case "actor":
      return r.actorId ?? "system";
  }
}

function groupLabel(key: string, by: GroupBy): string {
  switch (by) {
    case "day":
      return key;
    case "entity":
    case "actor":
      return key;
  }
}

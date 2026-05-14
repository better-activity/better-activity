/**
 * Public types for `@better-activity/react`.
 *
 * Every shape is generic over `TRecord` (the activity-record type, typically
 * `InferActivity<typeof activity>` or `InferRecord<typeof activity>`). When
 * you don't pass a generic the types still work — they default to the
 * library's loose `ActivityRecord` so users without the inference helper
 * still get useful intellisense.
 */

import type { ActivityRecord, BetterActivity, EntitiesConfig } from "better-activity";

// ---------------------------------------------------------------------------
// Default record type
// ---------------------------------------------------------------------------

/** Loose default used when the consumer doesn't pass a record generic. */
export type DefaultActivityRecord = ActivityRecord<EntitiesConfig>;

// ---------------------------------------------------------------------------
// Fetcher contracts
// ---------------------------------------------------------------------------

/**
 * The query payload your fetcher receives. Always serializable so it can
 * also be used as a stable cache key, sent over HTTP, posted to a server
 * action, etc.
 */
export interface ActivityQuery {
  entity?: string;
  entityId?: string;
  /** Filter to events authored by this actor id. */
  actorId?: string;
  /** Restrict to one or more action names. */
  actions?: string[];
  /** Inclusive ISO-8601 lower bound. */
  after?: string;
  /** Exclusive ISO-8601 upper bound. */
  before?: string;
  /** Page size. */
  limit?: number;
  /** Opaque cursor returned by the previous page. */
  cursor?: string | null;
  /** Sort by createdAt. Defaults to descending. */
  sortBy?: "asc" | "desc";
}

/**
 * A page of activity records plus a cursor for the next page.
 * Mirrors `BetterActivity#paginate`'s return shape so users can pipe it
 * through directly.
 */
export interface ActivityPage<TRecord = DefaultActivityRecord> {
  items: TRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * The async function `useActivity` calls. Receives an `ActivityQuery` and
 * returns a single page. Always rejects with an `Error` on failure (the
 * hook wraps non-Error rejections automatically).
 *
 * Implementations may honour the passed `AbortSignal` to cancel in-flight
 * requests when the consumer unmounts or query changes.
 */
export type ActivityFetcher<TRecord = DefaultActivityRecord> = (
  query: ActivityQuery,
  ctx: { signal: AbortSignal },
) => Promise<ActivityPage<TRecord>>;

/**
 * The function `useRecordActivity` calls to persist a new event. Receives
 * the user's input and returns the canonical record (typically the row the
 * backend wrote).
 */
export type ActivityRecordFn<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
> = (input: TInput, ctx: { signal: AbortSignal }) => Promise<TRecord>;

/**
 * The function `useActivitySubscription` calls to wire up a realtime
 * stream. Receives an `onEvent` callback to invoke whenever a new record
 * arrives and must return a teardown function.
 */
export type SubscribeFn<TRecord = DefaultActivityRecord> = (
  onEvent: (record: TRecord) => void,
  ctx: { onError?: (e: Error) => void },
) => (() => void) | Promise<() => void>;

// ---------------------------------------------------------------------------
// Optimistic-update record
// ---------------------------------------------------------------------------

/** Activity record annotated with optimistic metadata. */
export type OptimisticRecord<T> = T & {
  /** `true` while the underlying mutation is pending. */
  optimistic?: boolean;
};

// ---------------------------------------------------------------------------
// useActivity
// ---------------------------------------------------------------------------

export interface UseActivityOptions<TRecord = DefaultActivityRecord>
  extends Omit<ActivityQuery, "cursor"> {
  /**
   * Fetch function. Falls back to the one passed to `<ActivityProvider>`.
   */
  fetcher?: ActivityFetcher<TRecord>;
  /**
   * If false, skip the initial fetch. Default `true`.
   */
  enabled?: boolean;
  /**
   * Poll the fetcher at this interval (ms). Default disabled.
   */
  refetchInterval?: number;
  /**
   * How long the cached page is considered fresh. While fresh, repeated
   * hook calls reuse the result without re-fetching. Default 30s.
   */
  staleTime?: number;
  /**
   * Initial data to render on first paint (e.g. from a Server Component).
   * Skips the loading state until the first refetch.
   */
  initialData?: ActivityPage<TRecord> | TRecord[];
  /**
   * Called whenever a fetch succeeds. Useful for analytics or hydrating
   * external stores.
   */
  onSuccess?: (page: ActivityPage<TRecord>) => void;
  /** Called whenever a fetch fails. */
  onError?: (error: Error) => void;
}

export interface UseActivityResult<TRecord = DefaultActivityRecord> {
  /** Flat array of records across all loaded pages. */
  data: ReadonlyArray<OptimisticRecord<TRecord>>;
  /** First-load only. False once any data exists. */
  isLoading: boolean;
  /** True while any fetch (including refetch / loadMore) is in flight. */
  isFetching: boolean;
  /** Last error, or null. Cleared on successful refetch. */
  error: Error | null;
  /** True if the most recent page reports more records available. */
  hasMore: boolean;
  /** Re-run the query from page 1. */
  refetch: () => Promise<void>;
  /** Fetch the next page and append. No-op when `!hasMore`. */
  loadMore: () => Promise<void>;
  /** The canonical query the hook is using (cursor stripped). */
  query: ActivityQuery;
}

// ---------------------------------------------------------------------------
// useActivityInfinite
// ---------------------------------------------------------------------------

export interface UseActivityInfiniteOptions<TRecord = DefaultActivityRecord>
  extends UseActivityOptions<TRecord> {}

export interface UseActivityInfiniteResult<TRecord = DefaultActivityRecord>
  extends Omit<UseActivityResult<TRecord>, "loadMore"> {
  /** Array of pages in the order they were loaded. */
  pages: ReadonlyArray<ActivityPage<TRecord>>;
  /** Alias for `loadMore` — matches TanStack Query naming. */
  fetchNextPage: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// useRecordActivity
// ---------------------------------------------------------------------------

export interface UseRecordActivityOptions<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
> {
  /** Backend call. Falls back to the provider's `recordFn`. */
  recordFn?: ActivityRecordFn<TInput, TRecord>;
  /**
   * Produce an optimistic record from the input. Required for optimistic
   * insertion to happen.
   */
  optimistic?: (input: TInput) => TRecord;
  onSuccess?: (record: TRecord, input: TInput) => void;
  onError?: (error: Error, input: TInput) => void;
}

export interface UseRecordActivityResult<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
> {
  /** Fire-and-forget. Errors are surfaced through `onError` + `error`. */
  mutate: (input: TInput) => void;
  /** Await-able alternative. */
  mutateAsync: (input: TInput) => Promise<TRecord>;
  isPending: boolean;
  error: Error | null;
  /** Most recent successful record. */
  data: TRecord | null;
  /** Clear `error` and `data`. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// useActivitySubscription
// ---------------------------------------------------------------------------

export interface UseActivitySubscriptionOptions<
  TRecord = DefaultActivityRecord,
> {
  /** The user-supplied subscribe function. Falls back to provider's. */
  subscribe?: SubscribeFn<TRecord>;
  /**
   * Restrict which incoming events get merged. Default: every cache whose
   * query predicate matches the record (entity / entityId / actorId / actions).
   */
  filter?: (record: TRecord) => boolean;
  /** Called on every incoming event (after the filter). */
  onEvent?: (record: TRecord) => void;
  /** Called when the user's subscribe function errors. */
  onError?: (error: Error) => void;
  /** If false, the subscription stays closed. Default `true`. */
  enabled?: boolean;
}

export interface UseActivitySubscriptionResult {
  isConnected: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface ActivityFeedRenderProps<TRecord = DefaultActivityRecord>
  extends UseActivityResult<TRecord> {}

export interface FormatterContext<TRecord = DefaultActivityRecord> {
  record: TRecord;
  /** Default-resolved actor label. */
  actor: string;
  /** Human-readable description of the action. */
  description: string;
  /** Single-line title used by `ActivityItem` by default. */
  title: string;
  /** Relative time string (e.g. "5 minutes ago"). */
  timeAgo: string;
  /** Optional icon hint. Unset by default; formatters can fill this in. */
  icon?: string | null;
}

export interface ActivityItemRenderProps<TRecord = DefaultActivityRecord>
  extends FormatterContext<TRecord> {}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * A formatter map keyed by entity → action → formatter. Each formatter
 * receives the record and returns a partial `FormatterContext`; missing
 * fields fall through to the next layer.
 *
 * The `default` key is special-cased: it takes a record-level formatter
 * applied when no entity-specific match is found. All other keys are
 * entity names whose values are per-action formatter maps.
 */
export interface Formatters<TRecord = DefaultActivityRecord> {
  /** Per-entity, per-action formatter map. */
  [entity: string]:
    | {
        [action: string]: (record: TRecord) => Partial<FormatterContext<TRecord>>;
      }
    | ((record: TRecord) => Partial<FormatterContext<TRecord>>)
    | undefined;
  /** Catch-all formatter used when no entity/action match is found. */
  default?: (record: TRecord) => Partial<FormatterContext<TRecord>>;
}

/** Buckets returned by `groupActivity`. */
export interface ActivityGroup<TRecord = DefaultActivityRecord> {
  key: string;
  label: string;
  items: TRecord[];
}

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

export interface ActivityProviderProps<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
> {
  fetcher?: ActivityFetcher<TRecord>;
  recordFn?: ActivityRecordFn<TInput, TRecord>;
  subscribe?: SubscribeFn<TRecord>;
  defaultLimit?: number;
  staleTime?: number;
  /**
   * Optional reference to the user's `betterActivity()` instance. Only the
   * *type* is used (the runtime is untouched); it lets the provider's
   * descendants infer record types automatically when generics are omitted.
   */
  activity?: BetterActivity<EntitiesConfig> | undefined;
  children?: import("react").ReactNode;
}

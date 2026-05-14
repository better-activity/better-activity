/**
 * Minimal in-process cache + pub/sub for activity queries.
 *
 * Each cache entry corresponds to one canonical query key. Entries hold an
 * immutable `state` (replaced on every change so React's `===` equality
 * works for `useSyncExternalStore`) plus a set of listeners.
 *
 * The cache also tracks every active query so subscription-driven inserts
 * (`useActivitySubscription`) can broadcast a new record into every cache
 * whose query predicate matches.
 */

import { activityQueryKey, matchesQuery } from "./query-key";
import type {
  ActivityFetcher,
  ActivityPage,
  ActivityQuery,
  DefaultActivityRecord,
  OptimisticRecord,
} from "./types";

interface MinimalRecord {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  createdAt: Date | string;
}

/** Frozen snapshot stored in an entry. Replaced on every mutation. */
export interface CacheState<TRecord = DefaultActivityRecord> {
  data: ReadonlyArray<OptimisticRecord<TRecord>>;
  pages: ReadonlyArray<ActivityPage<TRecord>>;
  cursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  lastFetchedAt: number;
}

function emptyState<T>(): CacheState<T> {
  return {
    data: [],
    pages: [],
    cursor: null,
    hasMore: false,
    isLoading: true,
    isFetching: false,
    error: null,
    lastFetchedAt: 0,
  };
}

interface CacheEntry<TRecord> {
  key: string;
  query: ActivityQuery;
  state: CacheState<TRecord>;
  listeners: Set<() => void>;
  /** In-flight first-page fetch, shared for deduplication. */
  inFlight: Promise<void> | null;
  /** Abort handle for the most recent fetch. */
  abort: AbortController | null;
}

export class ActivityCache {
  private entries = new Map<string, CacheEntry<unknown>>();

  /** Get-or-create the entry for the given normalized query. */
  ensure<TRecord>(query: ActivityQuery): CacheEntry<TRecord> {
    const key = activityQueryKey(query);
    let entry = this.entries.get(key) as CacheEntry<TRecord> | undefined;
    if (!entry) {
      entry = {
        key,
        query,
        state: emptyState<TRecord>(),
        listeners: new Set(),
        inFlight: null,
        abort: null,
      };
      this.entries.set(key, entry as CacheEntry<unknown>);
    }
    return entry;
  }

  get<TRecord>(key: string): CacheEntry<TRecord> | undefined {
    return this.entries.get(key) as CacheEntry<TRecord> | undefined;
  }

  /** Replace an entry's state and notify listeners. */
  setState<TRecord>(
    entry: CacheEntry<TRecord>,
    update: (prev: CacheState<TRecord>) => CacheState<TRecord>,
  ): void {
    entry.state = update(entry.state);
    for (const cb of entry.listeners) cb();
  }

  /** Listen for state changes on a specific entry. */
  subscribe(key: string, cb: () => void): () => void {
    const entry = this.entries.get(key);
    if (!entry) return () => {};
    entry.listeners.add(cb);
    return () => {
      entry.listeners.delete(cb);
    };
  }

  /**
   * Drive a first-page fetch. Dedupes concurrent calls for the same key.
   * If `staleTime` is set and the entry was fetched recently, this is a no-op.
   */
  async fetch<TRecord>(
    entry: CacheEntry<TRecord>,
    fetcher: ActivityFetcher<TRecord>,
    opts: { staleTime?: number; force?: boolean } = {},
  ): Promise<void> {
    if (entry.inFlight) return entry.inFlight;
    const fresh =
      opts.staleTime !== undefined &&
      !opts.force &&
      entry.state.lastFetchedAt > 0 &&
      Date.now() - entry.state.lastFetchedAt < opts.staleTime;
    if (fresh) return;

    const ac = new AbortController();
    entry.abort?.abort();
    entry.abort = ac;

    this.setState(entry, (s) => ({ ...s, isFetching: true, error: null }));
    const promise = (async () => {
      try {
        const page = await fetcher(
          { ...entry.query, cursor: null },
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        this.setState(entry, (_s) => ({
          data: page.items as ReadonlyArray<OptimisticRecord<TRecord>>,
          pages: [page],
          cursor: page.nextCursor,
          hasMore: page.hasMore,
          isLoading: false,
          isFetching: false,
          error: null,
          lastFetchedAt: Date.now(),
        }));
      } catch (err) {
        if (ac.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        this.setState(entry, (s) => ({
          ...s,
          isFetching: false,
          isLoading: false,
          error,
        }));
      } finally {
        entry.inFlight = null;
      }
    })();
    entry.inFlight = promise;
    return promise;
  }

  /** Append the next page using the entry's current cursor. No-op if !hasMore. */
  async fetchNextPage<TRecord>(
    entry: CacheEntry<TRecord>,
    fetcher: ActivityFetcher<TRecord>,
  ): Promise<void> {
    if (!entry.state.hasMore || entry.state.isFetching) return;
    const ac = new AbortController();
    entry.abort?.abort();
    entry.abort = ac;
    this.setState(entry, (s) => ({ ...s, isFetching: true, error: null }));
    try {
      const page = await fetcher(
        { ...entry.query, cursor: entry.state.cursor },
        { signal: ac.signal },
      );
      if (ac.signal.aborted) return;
      this.setState(entry, (s) => ({
        ...s,
        data: [...s.data, ...page.items] as ReadonlyArray<OptimisticRecord<TRecord>>,
        pages: [...s.pages, page],
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        isFetching: false,
        lastFetchedAt: Date.now(),
      }));
    } catch (err) {
      if (ac.signal.aborted) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState(entry, (s) => ({ ...s, isFetching: false, error }));
    }
  }

  /**
   * Inject a new record into every cache whose query matches it. The record
   * is prepended (newest first). Used by `useActivitySubscription` for
   * realtime fan-out and by `useRecordActivity` for optimistic insertion.
   */
  inject<TRecord extends MinimalRecord>(
    record: TRecord | OptimisticRecord<TRecord>,
    opts: { dedupe?: boolean } = { dedupe: true },
  ): void {
    for (const entry of this.entries.values()) {
      if (!matchesQuery(entry.query, record)) continue;
      this.setState(entry as CacheEntry<TRecord>, (s) => {
        if (opts.dedupe && s.data.some((r) => (r as unknown as MinimalRecord).id === record.id)) {
          return s;
        }
        return {
          ...s,
          data: [record as OptimisticRecord<TRecord>, ...s.data],
        };
      });
    }
  }

  /** Replace a record by id (used to finalise optimistic insertions). */
  replace<TRecord extends MinimalRecord>(
    id: string,
    next: TRecord,
  ): void {
    for (const entry of this.entries.values()) {
      const e = entry as CacheEntry<TRecord>;
      const idx = e.state.data.findIndex(
        (r) => (r as unknown as MinimalRecord).id === id,
      );
      if (idx < 0) continue;
      this.setState(e, (s) => {
        const data = s.data.slice();
        data[idx] = next as OptimisticRecord<TRecord>;
        return { ...s, data };
      });
    }
  }

  /** Remove a record by id (used to roll back failed optimistic inserts). */
  remove<TRecord extends MinimalRecord>(id: string): void {
    for (const entry of this.entries.values()) {
      const e = entry as CacheEntry<TRecord>;
      const next = e.state.data.filter(
        (r) => (r as unknown as MinimalRecord).id !== id,
      );
      if (next.length !== e.state.data.length) {
        this.setState(e, (s) => ({ ...s, data: next }));
      }
    }
  }

  /** Iterate over all entries. Test-only — exposed for inspection. */
  *all(): Iterable<CacheEntry<unknown>> {
    yield* this.entries.values();
  }

  /** Tear down all subscriptions. Test-only. */
  reset(): void {
    for (const entry of this.entries.values()) {
      entry.abort?.abort();
      entry.listeners.clear();
    }
    this.entries.clear();
  }
}

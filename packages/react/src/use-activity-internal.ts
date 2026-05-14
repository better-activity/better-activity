/**
 * Internal: the shared subscription + state machinery that powers both
 * `useActivity` and `useActivityInfinite`. Not exported publicly — the
 * public hooks differ only in which fields they project from the cache
 * entry's state.
 */

import * as React from "react";
import { useActivityContext } from "./context";
import { activityQueryKey, normalizeQuery } from "./query-key";
import type { CacheState } from "./cache";
import type {
  ActivityFetcher,
  ActivityPage,
  ActivityQuery,
  DefaultActivityRecord,
  UseActivityOptions,
} from "./types";

const noopSubscribe = () => () => {};

export interface InternalActivityResult<TRecord> {
  state: CacheState<TRecord>;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  query: ActivityQuery;
}

export function useActivityInternal<TRecord = DefaultActivityRecord>(
  options: UseActivityOptions<TRecord>,
): InternalActivityResult<TRecord> {
  const ctx = useActivityContext<unknown, TRecord>();
  const fetcher = (options.fetcher ?? ctx.fetcher) as ActivityFetcher<TRecord> | null;

  const enabled = options.enabled !== false;
  const limit = options.limit ?? ctx.defaultLimit;
  const staleTime = options.staleTime ?? ctx.staleTime;

  const actionsKey = JSON.stringify(options.actions ?? null);
  const query = React.useMemo<ActivityQuery>(
    () =>
      normalizeQuery({
        entity: options.entity,
        entityId: options.entityId,
        actorId: options.actorId,
        actions: options.actions,
        after: options.after,
        before: options.before,
        limit,
        sortBy: options.sortBy,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      options.entity,
      options.entityId,
      options.actorId,
      actionsKey,
      options.after,
      options.before,
      limit,
      options.sortBy,
    ],
  );

  const key = React.useMemo(() => activityQueryKey(query), [query]);
  const entry = React.useMemo(
    () => ctx.cache.ensure<TRecord>(query),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.cache, key],
  );

  // Seed initialData once per key.
  const seededRef = React.useRef<Set<string>>(new Set());
  if (options.initialData && !seededRef.current.has(key) && entry.state.lastFetchedAt === 0) {
    seededRef.current.add(key);
    const page: ActivityPage<TRecord> = Array.isArray(options.initialData)
      ? { items: options.initialData, nextCursor: null, hasMore: false }
      : options.initialData;
    ctx.cache.setState(entry, () => ({
      data: page.items as ReadonlyArray<import("./types").OptimisticRecord<TRecord>>,
      pages: [page],
      cursor: page.nextCursor,
      hasMore: page.hasMore,
      isLoading: false,
      isFetching: false,
      error: null,
      lastFetchedAt: Date.now(),
    }));
  }

  const subscribe = React.useCallback(
    (cb: () => void) => ctx.cache.subscribe(key, cb),
    [ctx.cache, key],
  );

  const getSnapshot = React.useCallback(() => entry.state, [entry]);

  const state = React.useSyncExternalStore(
    enabled ? subscribe : noopSubscribe,
    getSnapshot,
    getSnapshot,
  );

  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;
  const onSuccessRef = React.useRef(options.onSuccess);
  onSuccessRef.current = options.onSuccess;
  const onErrorRef = React.useRef(options.onError);
  onErrorRef.current = options.onError;

  React.useEffect(() => {
    if (!enabled || !fetcherRef.current) return;
    let stale = false;
    void ctx.cache
      .fetch(entry, fetcherRef.current as ActivityFetcher<TRecord>, { staleTime })
      .then(() => {
        if (stale) return;
        const s = entry.state;
        if (s.error) onErrorRef.current?.(s.error);
        else if (s.pages.length > 0) onSuccessRef.current?.(s.pages[s.pages.length - 1]!);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ctx.cache, entry, staleTime, key]);

  React.useEffect(() => {
    if (!enabled || !options.refetchInterval || !fetcherRef.current) return;
    const id = setInterval(() => {
      void ctx.cache.fetch(
        entry,
        fetcherRef.current as ActivityFetcher<TRecord>,
        { force: true },
      );
    }, options.refetchInterval);
    return () => clearInterval(id);
  }, [enabled, ctx.cache, entry, options.refetchInterval]);

  const refetch = React.useCallback(async () => {
    if (!fetcherRef.current) {
      throw new Error(
        "useActivity: no fetcher available. Pass `fetcher` to the hook or wrap the tree in <ActivityProvider fetcher={...}>.",
      );
    }
    await ctx.cache.fetch(
      entry,
      fetcherRef.current as ActivityFetcher<TRecord>,
      { force: true },
    );
  }, [ctx.cache, entry]);

  const loadMore = React.useCallback(async () => {
    if (!fetcherRef.current) return;
    await ctx.cache.fetchNextPage(
      entry,
      fetcherRef.current as ActivityFetcher<TRecord>,
    );
  }, [ctx.cache, entry]);

  return { state, refetch, loadMore, query };
}

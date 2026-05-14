/**
 * Sub-entry: SWR adapter.
 *
 * `useActivitySWR` and `useActivityInfiniteSWR` build on `swr` for users
 * who already standardize on it. Importable as `@better-activity/react/swr`.
 */

import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { activityQueryKey } from "./query-key";
import type {
  ActivityFetcher,
  ActivityPage,
  ActivityQuery,
  DefaultActivityRecord,
} from "./types";

export interface UseActivitySWROptions<TRecord = DefaultActivityRecord>
  extends Omit<ActivityQuery, "cursor"> {
  fetcher: ActivityFetcher<TRecord>;
  refreshInterval?: number;
  dedupingInterval?: number;
}

function keyOf(q: ActivityQuery): string {
  return `better-activity:${activityQueryKey(q)}`;
}

/** SWR-backed version of `useActivity`. */
export function useActivitySWR<TRecord = DefaultActivityRecord>(
  options: UseActivitySWROptions<TRecord>,
) {
  const { fetcher, refreshInterval, dedupingInterval, ...query } = options;
  const swr = useSWR<ActivityPage<TRecord>, Error>(
    keyOf(query as ActivityQuery),
    async () => {
      const ac = new AbortController();
      return fetcher({ ...query, cursor: null }, { signal: ac.signal });
    },
    { refreshInterval, dedupingInterval },
  );
  return {
    data: swr.data?.items ?? ([] as readonly TRecord[]),
    page: swr.data,
    isLoading: swr.isLoading,
    isFetching: swr.isValidating,
    error: swr.error ?? null,
    hasMore: swr.data?.hasMore ?? false,
    refetch: () => swr.mutate().then(() => undefined),
  };
}

/**
 * SWR-backed version of `useActivityInfinite`. Uses `useSWRInfinite` and
 * the previous-page cursor to chain requests.
 */
export function useActivityInfiniteSWR<TRecord = DefaultActivityRecord>(
  options: UseActivitySWROptions<TRecord>,
) {
  const { fetcher, refreshInterval, dedupingInterval, ...query } = options;
  const baseKey = keyOf(query as ActivityQuery);

  const result = useSWRInfinite<ActivityPage<TRecord>, Error>(
    (index, previous) => {
      if (previous && !previous.hasMore) return null;
      const cursor = previous?.nextCursor ?? null;
      return [baseKey, index, cursor];
    },
    async ([, , cursor]: [string, number, string | null]) => {
      const ac = new AbortController();
      return fetcher({ ...query, cursor }, { signal: ac.signal });
    },
    { refreshInterval, dedupingInterval },
  );

  const pages = result.data ?? [];
  const last = pages[pages.length - 1];
  return {
    data: pages.flatMap((p) => p.items),
    pages,
    isLoading: result.isLoading,
    isFetching: result.isValidating,
    error: result.error ?? null,
    hasMore: Boolean(last?.hasMore),
    fetchNextPage: async () => {
      await result.setSize(result.size + 1);
    },
    refetch: () => result.mutate().then(() => undefined),
  };
}

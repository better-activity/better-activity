/**
 * Sub-entry: TanStack Query adapter.
 *
 * `useActivityQuery` and `useActivityInfiniteQuery` build on
 * `@tanstack/react-query` so users who already standardize on it get its
 * caching, devtools, and revalidation primitives for free.
 *
 * Importable as `@better-activity/react/tanstack`.
 */

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import { activityQueryKey } from "./query-key";
import type {
  ActivityFetcher,
  ActivityPage,
  ActivityQuery,
  DefaultActivityRecord,
} from "./types";

export interface UseActivityQueryOptions<TRecord = DefaultActivityRecord>
  extends Omit<ActivityQuery, "cursor"> {
  fetcher: ActivityFetcher<TRecord>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}

function deriveKey(query: ActivityQuery): QueryKey {
  return ["better-activity", activityQueryKey(query)];
}

/**
 * TanStack-backed version of `useActivity`. Returns the loaded page (one
 * page only — use `useActivityInfiniteQuery` for paginated lists).
 */
export function useActivityQuery<TRecord = DefaultActivityRecord>(
  options: UseActivityQueryOptions<TRecord>,
) {
  const { fetcher, enabled, staleTime, refetchInterval, ...query } = options;
  const result = useQuery<ActivityPage<TRecord>, Error>({
    queryKey: deriveKey(query as ActivityQuery),
    queryFn: ({ signal }) => fetcher({ ...query, cursor: null }, { signal }),
    enabled,
    staleTime,
    refetchInterval,
  });
  return {
    data: result.data?.items ?? ([] as readonly TRecord[]),
    page: result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    hasMore: result.data?.hasMore ?? false,
    refetch: () => result.refetch().then(() => undefined),
  };
}

/**
 * TanStack-backed version of `useActivityInfinite`. Maps `nextCursor` to
 * TanStack's `pageParam` plumbing.
 */
export function useActivityInfiniteQuery<TRecord = DefaultActivityRecord>(
  options: UseActivityQueryOptions<TRecord>,
) {
  const { fetcher, enabled, staleTime, refetchInterval, ...query } = options;
  const result = useInfiniteQuery<
    ActivityPage<TRecord>,
    Error,
    InfiniteData<ActivityPage<TRecord>>,
    QueryKey,
    string | null
  >({
    queryKey: deriveKey(query as ActivityQuery),
    queryFn: ({ pageParam, signal }) =>
      fetcher({ ...query, cursor: pageParam }, { signal }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime,
    refetchInterval,
  });
  const pages = result.data?.pages ?? [];
  return {
    data: pages.flatMap((p) => p.items),
    pages,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    hasMore: Boolean(result.hasNextPage),
    fetchNextPage: async () => {
      if (result.hasNextPage) await result.fetchNextPage();
    },
    refetch: () => result.refetch().then(() => undefined),
  };
}

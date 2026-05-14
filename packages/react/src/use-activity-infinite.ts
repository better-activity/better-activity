/**
 * `useActivityInfinite` — same data flow as `useActivity` but exposes the
 * per-page array (`pages`) and renames `loadMore` to `fetchNextPage` to
 * match TanStack Query's naming.
 *
 * Internally shares the same cache entry as a `useActivity` call with the
 * same query, so the two hooks compose cleanly within one tree.
 */

import { useActivityInternal } from "./use-activity-internal";
import type {
  DefaultActivityRecord,
  UseActivityInfiniteOptions,
  UseActivityInfiniteResult,
} from "./types";

/**
 * Infinite-scroll variant. Returns each loaded page individually plus the
 * flattened `data` array.
 *
 * @example
 * ```tsx
 * const { pages, fetchNextPage, hasMore } = useActivityInfinite({
 *   fetcher,
 *   entity: "user",
 *   limit: 50,
 * })
 * ```
 */
export function useActivityInfinite<TRecord = DefaultActivityRecord>(
  options: UseActivityInfiniteOptions<TRecord>,
): UseActivityInfiniteResult<TRecord> {
  const { state, refetch, loadMore, query } = useActivityInternal<TRecord>(options);
  return {
    data: state.data,
    pages: state.pages,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    hasMore: state.hasMore,
    refetch,
    fetchNextPage: loadMore,
    query,
  };
}

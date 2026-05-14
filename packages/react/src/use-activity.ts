/**
 * `useActivity` — primary hook.
 *
 * Backed by an internal cache + `useSyncExternalStore`. Multiple hooks
 * observing the same canonical query share state, so simultaneous refetches
 * dedupe.
 *
 * @example
 * ```tsx
 * const { data, isLoading, loadMore, hasMore } = useActivity({
 *   fetcher,
 *   entity: "project",
 *   entityId: "prj_1",
 *   limit: 25,
 * })
 * ```
 *
 * @typeParam TRecord - Record type. Pass `InferActivity<typeof activity>`
 *                      for full per-entity narrowing.
 */

import { useActivityInternal } from "./use-activity-internal";
import type {
  DefaultActivityRecord,
  UseActivityOptions,
  UseActivityResult,
} from "./types";

export function useActivity<TRecord = DefaultActivityRecord>(
  options: UseActivityOptions<TRecord>,
): UseActivityResult<TRecord> {
  const { state, refetch, loadMore, query } = useActivityInternal<TRecord>(options);
  return {
    data: state.data,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    hasMore: state.hasMore,
    refetch,
    loadMore,
    query,
  };
}

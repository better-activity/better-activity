/**
 * `ActivityProvider` — single place to register a fetcher, recordFn, and
 * subscribe function. Descendants can omit those from hook options and
 * inherit them from the provider.
 *
 * The provider also owns the `ActivityCache` so multiple hooks observing
 * the same query share state.
 */

import * as React from "react";
import { ActivityCache } from "./cache";
import type {
  ActivityFetcher,
  ActivityProviderProps,
  ActivityRecordFn,
  DefaultActivityRecord,
  SubscribeFn,
} from "./types";

interface ContextValue<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
> {
  fetcher: ActivityFetcher<TRecord> | null;
  recordFn: ActivityRecordFn<TInput, TRecord> | null;
  subscribe: SubscribeFn<TRecord> | null;
  defaultLimit: number;
  staleTime: number;
  cache: ActivityCache;
}

const defaultCtx: ContextValue = {
  fetcher: null,
  recordFn: null,
  subscribe: null,
  defaultLimit: 50,
  staleTime: 30_000,
  cache: new ActivityCache(),
};

const Ctx = React.createContext<ContextValue<unknown, unknown>>(
  defaultCtx as ContextValue<unknown, unknown>,
);

/**
 * Provider component. All children can call `useActivity`, `useRecordActivity`,
 * `useActivitySubscription` without passing the underlying functions.
 *
 * @example
 * ```tsx
 * <ActivityProvider fetcher={fetchActivity} recordFn={recordActivity}>
 *   <App />
 * </ActivityProvider>
 * ```
 */
export function ActivityProvider<TInput = unknown, TRecord = DefaultActivityRecord>(
  props: ActivityProviderProps<TInput, TRecord>,
): React.JSX.Element {
  // The cache is stable across renders.
  const cache = React.useMemo(() => new ActivityCache(), []);
  const value = React.useMemo<ContextValue<TInput, TRecord>>(
    () => ({
      fetcher: props.fetcher ?? null,
      recordFn: props.recordFn ?? null,
      subscribe: props.subscribe ?? null,
      defaultLimit: props.defaultLimit ?? 50,
      staleTime: props.staleTime ?? 30_000,
      cache,
    }),
    [
      props.fetcher,
      props.recordFn,
      props.subscribe,
      props.defaultLimit,
      props.staleTime,
      cache,
    ],
  );
  return (
    <Ctx.Provider value={value as ContextValue<unknown, unknown>}>
      {props.children}
    </Ctx.Provider>
  );
}

/**
 * Read the provider's config. Hooks call this internally to fall back when
 * their own props are missing.
 */
export function useActivityContext<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
>(): ContextValue<TInput, TRecord> {
  return React.useContext(Ctx) as ContextValue<TInput, TRecord>;
}

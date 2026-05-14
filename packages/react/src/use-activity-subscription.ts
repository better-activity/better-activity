/**
 * `useActivitySubscription` — bridge a user-supplied realtime stream into
 * the cache.
 *
 * Each event is injected into every cache entry whose query predicate
 * matches the record. The hook itself returns `{ isConnected, error }`;
 * its primary job is the side-effect.
 *
 * The user's `subscribe` callback may return a cleanup function
 * synchronously or asynchronously (via a Promise). It is invoked with an
 * `onEvent` callback and an `onError` callback.
 */

import * as React from "react";
import { useActivityContext } from "./context";
import type {
  DefaultActivityRecord,
  SubscribeFn,
  UseActivitySubscriptionOptions,
  UseActivitySubscriptionResult,
} from "./types";

/**
 * Wire up a realtime event stream.
 *
 * @example
 * ```tsx
 * useActivitySubscription({
 *   subscribe: (onEvent) => {
 *     const sock = new WebSocket("wss://my.app/activity")
 *     sock.onmessage = (ev) => onEvent(JSON.parse(ev.data))
 *     return () => sock.close()
 *   },
 *   onEvent: (record) => console.log("incoming", record),
 * })
 * ```
 */
export function useActivitySubscription<TRecord = DefaultActivityRecord>(
  options: UseActivitySubscriptionOptions<TRecord> = {},
): UseActivitySubscriptionResult {
  const ctx = useActivityContext<unknown, TRecord>();
  const subscribe = (options.subscribe ?? ctx.subscribe) as SubscribeFn<TRecord> | null;

  const enabled = options.enabled !== false;

  const [isConnected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const filterRef = React.useRef(options.filter);
  filterRef.current = options.filter;
  const onEventRef = React.useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const onErrorRef = React.useRef(options.onError);
  onErrorRef.current = options.onError;

  React.useEffect(() => {
    if (!enabled || !subscribe) {
      setConnected(false);
      return;
    }

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    const onEvent = (record: TRecord) => {
      if (filterRef.current && !filterRef.current(record)) return;
      ctx.cache.inject(record as never);
      onEventRef.current?.(record);
    };

    const onSubscribeError = (e: Error) => {
      setError(e);
      onErrorRef.current?.(e);
    };

    setConnected(true);
    setError(null);

    try {
      const result = subscribe(onEvent, { onError: onSubscribeError });
      if (result instanceof Promise) {
        result
          .then((teardown) => {
            if (cancelled) {
              teardown?.();
            } else {
              cleanup = teardown;
            }
          })
          .catch((err) => {
            const e = err instanceof Error ? err : new Error(String(err));
            setError(e);
            setConnected(false);
            onErrorRef.current?.(e);
          });
      } else {
        cleanup = result;
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setConnected(false);
      onErrorRef.current?.(e);
    }

    return () => {
      cancelled = true;
      setConnected(false);
      cleanup?.();
    };
  }, [enabled, subscribe, ctx.cache]);

  return { isConnected, error };
}

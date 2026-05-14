/**
 * `useRecordActivity` — mutation-style hook for writing new activity.
 *
 * If `optimistic` is supplied, the produced record is injected into every
 * matching cache *before* the network call; on success it is replaced with
 * the real record; on failure it is rolled back.
 *
 * The optimistic record carries an `optimistic: true` flag (via the
 * `OptimisticRecord<T>` intersection) so callers can dim the row in their
 * render-prop UI.
 */

import * as React from "react";
import { useActivityContext } from "./context";
import type {
  ActivityRecordFn,
  DefaultActivityRecord,
  UseRecordActivityOptions,
  UseRecordActivityResult,
} from "./types";

interface MinimalRecord {
  id: string;
}

let optimisticCounter = 0;
function makeOptimisticId(): string {
  // Distinct from the `act_<ts>_<rand>` ids the server generates.
  optimisticCounter += 1;
  return `__opt_${Date.now()}_${optimisticCounter}`;
}

interface State<TRecord> {
  isPending: boolean;
  error: Error | null;
  data: TRecord | null;
}

const INITIAL: State<unknown> = { isPending: false, error: null, data: null };

/**
 * Persist a new activity event. Returns mutation state + helpers.
 *
 * @typeParam TInput   - The argument your `recordFn` accepts.
 * @typeParam TRecord  - The record type your `recordFn` returns.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useRecordActivity({
 *   recordFn: (input) => fetch("/api/activity", { method: "POST", body: JSON.stringify(input) }).then(r => r.json()),
 *   optimistic: (input) => ({ ...input, id: "tmp", createdAt: new Date() } as Activity),
 * })
 *
 * <button onClick={() => mutate({ entity: "user", action: "logged_in", … })} />
 * ```
 */
export function useRecordActivity<
  TInput = unknown,
  TRecord = DefaultActivityRecord,
>(
  options: UseRecordActivityOptions<TInput, TRecord> = {},
): UseRecordActivityResult<TInput, TRecord> {
  const ctx = useActivityContext<TInput, TRecord>();
  const recordFn = (options.recordFn ?? ctx.recordFn) as
    | ActivityRecordFn<TInput, TRecord>
    | null;

  const [state, setState] = React.useState<State<TRecord>>(
    INITIAL as State<TRecord>,
  );

  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const inFlight = React.useRef(new Set<AbortController>());
  React.useEffect(() => {
    const set = inFlight.current;
    return () => {
      for (const ac of set) ac.abort();
    };
  }, []);

  const mutateAsync = React.useCallback(
    async (input: TInput): Promise<TRecord> => {
      if (!recordFn) {
        const err = new Error(
          "useRecordActivity: no recordFn available. Pass `recordFn` to the hook or wrap the tree in <ActivityProvider recordFn={...}>.",
        );
        setState((s) => ({ ...s, error: err }));
        throw err;
      }
      setState((s) => ({ ...s, isPending: true, error: null }));

      const buildOpt = optionsRef.current.optimistic;
      let optimisticId: string | null = null;
      if (buildOpt) {
        const tmp = buildOpt(input) as unknown as MinimalRecord;
        optimisticId = tmp.id || makeOptimisticId();
        const tmpRecord = { ...(tmp as object), id: optimisticId, optimistic: true } as
          | (TRecord & MinimalRecord & { optimistic?: boolean })
          | unknown;
        ctx.cache.inject(tmpRecord as never);
      }

      const ac = new AbortController();
      inFlight.current.add(ac);
      try {
        const created = await recordFn(input, { signal: ac.signal });
        if (optimisticId) {
          ctx.cache.replace(optimisticId, created as never);
        } else {
          ctx.cache.inject(created as never);
        }
        setState({ isPending: false, error: null, data: created });
        optionsRef.current.onSuccess?.(created, input);
        return created;
      } catch (err) {
        if (optimisticId) ctx.cache.remove(optimisticId);
        const error = err instanceof Error ? err : new Error(String(err));
        setState((s) => ({ ...s, isPending: false, error }));
        optionsRef.current.onError?.(error, input);
        throw error;
      } finally {
        inFlight.current.delete(ac);
      }
    },
    [recordFn, ctx.cache],
  );

  const mutate = React.useCallback(
    (input: TInput) => {
      // Fire-and-forget. Swallow unhandled rejection — errors surface via
      // `error` state and the `onError` callback.
      void mutateAsync(input).catch(() => {});
    },
    [mutateAsync],
  );

  const reset = React.useCallback(() => {
    setState(INITIAL as State<TRecord>);
  }, []);

  return {
    mutate,
    mutateAsync,
    isPending: state.isPending,
    error: state.error,
    data: state.data,
    reset,
  };
}

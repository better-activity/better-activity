/**
 * Shared test helpers: a typed sample activity instance, a controllable
 * fetcher mock, and a tiny page builder.
 */

import * as React from "react";
import { ActivityProvider } from "../src/context";
import type {
  ActivityFetcher,
  ActivityPage,
  ActivityRecordFn,
  SubscribeFn,
} from "../src/types";

export interface Activity {
  id: string;
  entity: "user" | "project";
  entityId: string;
  action: "created" | "updated" | "logged_in" | "archived";
  actorId: string | null;
  actorType: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

let n = 0;
export function makeRecord(overrides: Partial<Activity> = {}): Activity {
  n += 1;
  return {
    id: `r${n}`,
    entity: "user",
    entityId: "u1",
    action: "created",
    actorId: "admin",
    actorType: null,
    metadata: null,
    ip: null,
    userAgent: null,
    requestId: null,
    createdAt: new Date(2024, 0, 1, 0, 0, n),
    ...overrides,
  };
}

export function page(items: Activity[], hasMore = false, nextCursor: string | null = null): ActivityPage<Activity> {
  return { items, hasMore, nextCursor };
}

/**
 * Build a fetcher that returns pre-baked pages on each call. Tracks call
 * count and the arguments it was invoked with.
 */
export function makeFetcher(pages: ActivityPage<Activity>[] | ((q: import("../src/types").ActivityQuery, i: number) => ActivityPage<Activity>)) {
  const calls: Array<{ query: import("../src/types").ActivityQuery; signal: AbortSignal }> = [];
  let i = 0;
  const fetcher: ActivityFetcher<Activity> = async (query, ctx) => {
    calls.push({ query, signal: ctx.signal });
    const cur = i;
    i += 1;
    if (typeof pages === "function") return pages(query, cur);
    return pages[Math.min(cur, pages.length - 1)] ?? page([]);
  };
  return Object.assign(fetcher, {
    calls,
    callCount: () => calls.length,
    reset: () => {
      calls.length = 0;
      i = 0;
    },
  });
}

export function makeRecordFn(opts: {
  delay?: number;
  fail?: boolean;
} = {}) {
  const calls: unknown[] = [];
  const recordFn: ActivityRecordFn<Partial<Activity>, Activity> = async (input) => {
    calls.push(input);
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
    if (opts.fail) throw new Error("boom");
    return makeRecord({ ...input, id: `srv_${calls.length}` });
  };
  return Object.assign(recordFn, { calls });
}

export function makeSubscribe() {
  let onEvent: ((r: Activity) => void) | null = null;
  let unsubscribed = false;
  const subscribe: SubscribeFn<Activity> = (cb) => {
    onEvent = cb;
    return () => {
      unsubscribed = true;
      onEvent = null;
    };
  };
  return Object.assign(subscribe, {
    emit: (r: Activity) => onEvent?.(r),
    isActive: () => onEvent !== null,
    wasUnsubscribed: () => unsubscribed,
  });
}

export function wrapWithProvider(props: {
  fetcher?: ActivityFetcher<Activity>;
  recordFn?: ActivityRecordFn<Partial<Activity>, Activity>;
  subscribe?: SubscribeFn<Activity>;
  defaultLimit?: number;
  staleTime?: number;
}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ActivityProvider<Partial<Activity>, Activity>
        fetcher={props.fetcher}
        recordFn={props.recordFn}
        subscribe={props.subscribe}
        defaultLimit={props.defaultLimit}
        staleTime={props.staleTime}
      >
        {children}
      </ActivityProvider>
    );
  };
}

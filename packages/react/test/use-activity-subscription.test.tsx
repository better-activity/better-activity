import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivity } from "../src/use-activity";
import { useActivitySubscription } from "../src/use-activity-subscription";
import {
  makeFetcher,
  makeRecord,
  makeSubscribe,
  page,
  wrapWithProvider,
  type Activity,
} from "./test-utils";

describe("useActivitySubscription", () => {
  it("merges incoming events into matching caches", async () => {
    const fetcher = makeFetcher([page([makeRecord({ id: "a" })])]);
    const subscribe = makeSubscribe();
    const wrapper = wrapWithProvider({ fetcher, subscribe });

    // Both hooks must be in the same tree so they share the provider/cache.
    const { result } = renderHook(
      () => ({
        list: useActivity<Activity>({ entity: "user" }),
        sub: useActivitySubscription<Activity>(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    await waitFor(() => expect(subscribe.isActive()).toBe(true));

    act(() => {
      subscribe.emit(makeRecord({ id: "b", entity: "user" }));
    });
    expect(result.current.list.data[0]!.id).toBe("b");
    expect(result.current.list.data).toHaveLength(2);
  });

  it("skips events that don't match a cache's filter", async () => {
    const fetcher = makeFetcher([page([makeRecord({ id: "a" })])]);
    const subscribe = makeSubscribe();
    const wrapper = wrapWithProvider({ fetcher, subscribe });

    const { result } = renderHook(
      () => ({
        list: useActivity<Activity>({ entity: "user" }),
        sub: useActivitySubscription<Activity>(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    await waitFor(() => expect(subscribe.isActive()).toBe(true));

    act(() => {
      subscribe.emit(makeRecord({ id: "p1", entity: "project", action: "archived" }));
    });
    expect(result.current.list.data).toHaveLength(1);
  });

  it("respects the per-hook filter prop", async () => {
    const fetcher = makeFetcher([page([])]);
    const subscribe = makeSubscribe();
    const onEvent = vi.fn();
    const wrapper = wrapWithProvider({ fetcher, subscribe });

    renderHook(
      () => ({
        list: useActivity<Activity>({ entity: "user" }),
        sub: useActivitySubscription<Activity>({
          filter: (r) => r.action === "logged_in",
          onEvent,
        }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(subscribe.isActive()).toBe(true));

    act(() => subscribe.emit(makeRecord({ action: "created" })));
    act(() => subscribe.emit(makeRecord({ action: "logged_in" })));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("tears down subscription on unmount", async () => {
    const subscribe = makeSubscribe();
    const wrapper = wrapWithProvider({ subscribe });
    const { unmount } = renderHook(
      () => useActivitySubscription<Activity>(),
      { wrapper },
    );
    await waitFor(() => expect(subscribe.isActive()).toBe(true));
    unmount();
    expect(subscribe.wasUnsubscribed()).toBe(true);
  });
});

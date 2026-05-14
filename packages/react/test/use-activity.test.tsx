import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivity } from "../src/use-activity";
import {
  makeFetcher,
  makeRecord,
  page,
  wrapWithProvider,
  type Activity,
} from "./test-utils";

describe("useActivity", () => {
  it("loads data and exposes loading → success states", async () => {
    const records = [makeRecord(), makeRecord(), makeRecord()];
    const fetcher = makeFetcher([page(records)]);
    const { result } = renderHook(
      () => useActivity<Activity>({ fetcher, entity: "user" }),
      { wrapper: wrapWithProvider({}) },
    );
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(3);
    expect(result.current.error).toBeNull();
  });

  it("falls back to fetcher from <ActivityProvider>", async () => {
    const records = [makeRecord()];
    const fetcher = makeFetcher([page(records)]);
    const { result } = renderHook(
      () => useActivity<Activity>({ entity: "user" }),
      { wrapper: wrapWithProvider({ fetcher }) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
  });

  it("loadMore appends the next page", async () => {
    const fetcher = makeFetcher([
      page([makeRecord(), makeRecord()], true, "c1"),
      page([makeRecord()], false, null),
    ]);
    const { result } = renderHook(
      () => useActivity<Activity>({ fetcher, entity: "user", limit: 2 }),
      { wrapper: wrapWithProvider({}) },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.data).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });

  it("refetch refreshes from page 1 even if cached", async () => {
    const records = [makeRecord()];
    const fetcher = makeFetcher([page(records), page([makeRecord(), makeRecord()])]);
    const { result } = renderHook(
      () => useActivity<Activity>({ fetcher, entity: "user", staleTime: 60_000 }),
      { wrapper: wrapWithProvider({}) },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toHaveLength(2);
    expect(fetcher.callCount()).toBe(2);
  });

  it("staleTime skips the second fetch when two hooks share a tree", async () => {
    const fetcher = makeFetcher([page([makeRecord()]), page([makeRecord(), makeRecord()])]);
    const wrapper = wrapWithProvider({ fetcher });

    // Two hooks with the same query in the SAME tree share a cache entry,
    // so the second hook's mount must NOT trigger a duplicate fetch.
    const { result } = renderHook(
      () => ({
        a: useActivity<Activity>({ entity: "user", staleTime: 60_000 }),
        b: useActivity<Activity>({ entity: "user", staleTime: 60_000 }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.a.isLoading).toBe(false));
    expect(result.current.b.isLoading).toBe(false);
    expect(fetcher.callCount()).toBe(1);
  });

  it("surfaces errors and clears them on refetch", async () => {
    let shouldFail = true;
    const records = [makeRecord()];
    const fetcher = async () => {
      if (shouldFail) throw new Error("boom");
      return page(records);
    };
    const { result } = renderHook(
      () => useActivity<Activity>({ fetcher, entity: "user" }),
      { wrapper: wrapWithProvider({}) },
    );
    await waitFor(() => expect(result.current.error?.message).toBe("boom"));

    shouldFail = false;
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toHaveLength(1);
  });

  it("enabled: false skips fetching", async () => {
    const fetcher = makeFetcher([page([makeRecord()])]);
    const { result } = renderHook(
      () => useActivity<Activity>({ fetcher, entity: "user", enabled: false }),
      { wrapper: wrapWithProvider({}) },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(fetcher.callCount()).toBe(0);
    expect(result.current.data).toEqual([]);
  });

  it("initialData hydrates without a fetch", async () => {
    const init = [makeRecord(), makeRecord()];
    const fetcher = makeFetcher([page([])]);
    const { result } = renderHook(
      () =>
        useActivity<Activity>({
          fetcher,
          entity: "user",
          initialData: init,
          staleTime: 60_000,
        }),
      { wrapper: wrapWithProvider({}) },
    );
    // initialData should be present immediately (no loading state once seeded).
    expect(result.current.data).toHaveLength(2);
    expect(result.current.isLoading).toBe(false);
  });

  it("refetchInterval polls", async () => {
    vi.useFakeTimers();
    const fetcher = makeFetcher([
      page([makeRecord()]),
      page([makeRecord(), makeRecord()]),
    ]);
    const { result } = renderHook(
      () =>
        useActivity<Activity>({
          fetcher,
          entity: "user",
          refetchInterval: 100,
        }),
      { wrapper: wrapWithProvider({}) },
    );
    await vi.waitFor(() => expect(result.current.data).toHaveLength(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110);
    });
    expect(fetcher.callCount()).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });

  it("two hooks with the same query share state (same tree)", async () => {
    const records = [makeRecord(), makeRecord()];
    const fetcher = makeFetcher([page(records)]);
    const wrapper = wrapWithProvider({ fetcher });
    const { result } = renderHook(
      () => ({
        a: useActivity<Activity>({ entity: "user" }),
        b: useActivity<Activity>({ entity: "user" }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.a.data).toHaveLength(2));
    expect(result.current.b.data).toHaveLength(2);
    expect(fetcher.callCount()).toBe(1);
  });
});

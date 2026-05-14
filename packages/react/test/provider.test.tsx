import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivity } from "../src/use-activity";
import { useActivityContext } from "../src/context";
import {
  makeFetcher,
  makeRecord,
  page,
  wrapWithProvider,
  type Activity,
} from "./test-utils";

describe("ActivityProvider", () => {
  it("falls back to the provider's fetcher when omitted from the hook", async () => {
    const fetcher = makeFetcher([page([makeRecord()])]);
    const { result } = renderHook(
      () => useActivity<Activity>({ entity: "user" }),
      { wrapper: wrapWithProvider({ fetcher }) },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetcher.callCount()).toBe(1);
  });

  it("hook-level fetcher overrides provider fetcher", async () => {
    const provFetcher = makeFetcher([page([makeRecord()])]);
    const local = makeFetcher([page([makeRecord(), makeRecord()])]);
    const { result } = renderHook(
      () => useActivity<Activity>({ fetcher: local, entity: "user" }),
      { wrapper: wrapWithProvider({ fetcher: provFetcher }) },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(provFetcher.callCount()).toBe(0);
    expect(local.callCount()).toBe(1);
  });

  it("exposes context for advanced users", async () => {
    const fetcher = makeFetcher([page([])]);
    const { result } = renderHook(() => useActivityContext(), {
      wrapper: wrapWithProvider({ fetcher, defaultLimit: 25, staleTime: 5_000 }),
    });
    expect(result.current.defaultLimit).toBe(25);
    expect(result.current.staleTime).toBe(5_000);
    expect(result.current.fetcher).toBe(fetcher);
  });

  it("errors clearly when no fetcher anywhere is provided", async () => {
    const { result } = renderHook(
      () => useActivity<Activity>({ entity: "user" }),
      { wrapper: wrapWithProvider({}) },
    );
    // No fetcher at all → silently stays in loading: false / empty data.
    // Explicit refetch should throw a clear error.
    await act(async () => {
      await expect(result.current.refetch()).rejects.toThrow(/no fetcher/);
    });
  });
});

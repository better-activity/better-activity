import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivity } from "../src/use-activity";
import { useRecordActivity } from "../src/use-record-activity";
import {
  makeFetcher,
  makeRecord,
  makeRecordFn,
  page,
  wrapWithProvider,
  type Activity,
} from "./test-utils";

describe("useRecordActivity", () => {
  it("calls the recordFn and exposes pending → success states", async () => {
    const recordFn = makeRecordFn();
    const { result } = renderHook(
      () => useRecordActivity<Partial<Activity>, Activity>({ recordFn }),
      { wrapper: wrapWithProvider({}) },
    );
    expect(result.current.isPending).toBe(false);
    await act(async () => {
      await result.current.mutateAsync({ entity: "user", entityId: "u1", action: "created" });
    });
    expect(result.current.data?.id).toMatch(/^srv_/);
    expect(result.current.error).toBeNull();
    expect(recordFn.calls).toHaveLength(1);
  });

  it("optimistic insertion appears in matching useActivity caches", async () => {
    const records = [makeRecord({ id: "first" })];
    const fetcher = makeFetcher([page(records)]);
    // 200ms delay so the optimistic phase is observably longer than
    // waitFor's polling interval.
    const recordFn = makeRecordFn({ delay: 200 });
    const wrapper = wrapWithProvider({ fetcher, recordFn });

    const { result } = renderHook(
      () => ({
        list: useActivity<Activity>({ entity: "user" }),
        mut: useRecordActivity<Partial<Activity>, Activity>({
          optimistic: (input) => ({
            ...makeRecord(),
            ...input,
            id: "__tmp_id",
          } as Activity),
        }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    // Fire the mutation outside `act` so React flushes the
    // useSyncExternalStore re-render between the optimistic injection and
    // the (slow) recordFn resolution. The optimistic record must appear
    // BEFORE the mutation resolves.
    const p = result.current.mut.mutateAsync({
      entity: "user",
      entityId: "u1",
      action: "created",
    });

    await waitFor(() => {
      expect(result.current.list.data).toHaveLength(2);
      expect(
        result.current.list.data.some(
          (r) => (r as Activity & { optimistic?: boolean }).optimistic,
        ),
      ).toBe(true);
    });

    await act(async () => {
      await p;
    });

    // After resolution the temp record is replaced by the server's.
    expect(result.current.list.data).toHaveLength(2);
    expect(
      result.current.list.data.some(
        (r) => (r as Activity & { optimistic?: boolean }).optimistic,
      ),
    ).toBe(false);
    expect(result.current.list.data[0]!.id).toMatch(/^srv_/);
  });

  it("rolls back the optimistic record on error", async () => {
    const records = [makeRecord({ id: "x" })];
    const fetcher = makeFetcher([page(records)]);
    const recordFn = makeRecordFn({ fail: true });
    const wrapper = wrapWithProvider({ fetcher, recordFn });

    const { result } = renderHook(
      () => ({
        list: useActivity<Activity>({ entity: "user" }),
        mut: useRecordActivity<Partial<Activity>, Activity>({
          optimistic: (input) => ({ ...makeRecord(), ...input, id: "__tmp_id" } as Activity),
        }),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    await act(async () => {
      try {
        await result.current.mut.mutateAsync({
          entity: "user",
          entityId: "u1",
          action: "created",
        });
      } catch {
        /* expected */
      }
    });

    expect(result.current.list.data).toHaveLength(1);
    expect(result.current.mut.error?.message).toBe("boom");
  });

  it("throws when no recordFn is configured", async () => {
    const { result } = renderHook(
      () => useRecordActivity<Partial<Activity>, Activity>({}),
      { wrapper: wrapWithProvider({}) },
    );
    await act(async () => {
      await expect(
        result.current.mutateAsync({ entity: "user", entityId: "u1", action: "created" }),
      ).rejects.toThrow(/no recordFn/);
    });
  });
});

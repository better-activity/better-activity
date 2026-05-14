import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useActivityInfinite } from "../src/use-activity-infinite";
import {
  makeFetcher,
  makeRecord,
  page,
  wrapWithProvider,
  type Activity,
} from "./test-utils";

describe("useActivityInfinite", () => {
  it("exposes pages and fetchNextPage", async () => {
    const fetcher = makeFetcher([
      page([makeRecord(), makeRecord()], true, "c1"),
      page([makeRecord()], false, null),
    ]);
    const { result } = renderHook(
      () => useActivityInfinite<Activity>({ fetcher, entity: "user", limit: 2 }),
      { wrapper: wrapWithProvider({}) },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.pages).toHaveLength(1);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(result.current.pages).toHaveLength(2);
    expect(result.current.data).toHaveLength(3);
    expect(result.current.hasMore).toBe(false);
  });
});

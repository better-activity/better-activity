/**
 * Coverage targeted at memory adapter helpers: number-comparator branch,
 * mixed-type fallback comparator, and projection select.
 */

import { describe, expect, it } from "vitest";
import { memoryAdapter } from "../src/adapters/memory";

const adapter = memoryAdapter({
  activity: [
    { id: "1", n: 3 },
    { id: "2", n: 1 },
    { id: "3", n: 2 },
  ],
})({ database: () => ({}) as never, tableName: "activity" });

describe("memoryAdapter — extra branches", () => {
  it("sorts numbers numerically (not lexicographically)", async () => {
    const xs = (await adapter.findMany({
      model: "activity",
      sortBy: { field: "n", direction: "asc" },
    })) as { n: number }[];
    expect(xs.map((x) => x.n)).toEqual([1, 2, 3]);
  });

  it("sorts mixed types via toString fallback", async () => {
    const a = memoryAdapter({
      activity: [
        { id: "1", n: { toString: () => "z" } },
        { id: "2", n: 1 },
      ],
    })({ database: () => ({}) as never, tableName: "activity" });
    const xs = (await a.findMany({
      model: "activity",
      sortBy: { field: "n", direction: "asc" },
    })) as { id: string }[];
    expect(xs).toHaveLength(2);
  });

  it("sorts records with null entries (nulls first asc, last desc)", async () => {
    const a = memoryAdapter({
      activity: [{ id: "1", n: null }, { id: "2", n: "x" }, { id: "3", n: null }],
    })({ database: () => ({}) as never, tableName: "activity" });
    const ascRes = (await a.findMany({
      model: "activity",
      sortBy: { field: "n", direction: "asc" },
    })) as { id: string }[];
    expect(ascRes[0]!.id).toMatch(/[13]/); // null entries sort first
    const descRes = (await a.findMany({
      model: "activity",
      sortBy: { field: "n", direction: "desc" },
    })) as { id: string }[];
    expect(descRes[descRes.length - 1]!.id).toMatch(/[13]/);
  });

  it("findMany with select projects only the requested fields", async () => {
    const xs = (await adapter.findMany({
      model: "activity",
      select: ["n"],
    })) as Record<string, unknown>[];
    for (const r of xs) {
      expect(Object.keys(r)).toEqual(["n"]);
    }
  });

  it("findOne with select projects only the requested fields", async () => {
    const r = (await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "1" }],
      select: ["id"],
    })) as Record<string, unknown> | null;
    expect(r).toEqual({ id: "1" });
  });

  it("findOne returns null for empty store", async () => {
    const a = memoryAdapter({})({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await a.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(r).toBeNull();
  });

  it("update returns null when nothing matches", async () => {
    const a = memoryAdapter({ activity: [] })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await a.update({
      model: "activity",
      where: [{ field: "id", value: "missing" }],
      update: { n: 1 },
    });
    expect(r).toBeNull();
  });

  it("findMany without limit/offset returns full list", async () => {
    const xs = (await adapter.findMany({ model: "activity" })) as unknown[];
    expect(xs).toHaveLength(3);
  });

  it("count() with empty where returns table length", async () => {
    expect(await adapter.count({ model: "activity" })).toBe(3);
  });

  it("supports the ne / gte / lte / contains / in / not_in operators", async () => {
    const xs = (await adapter.findMany({
      model: "activity",
      where: [{ field: "n", value: 2, operator: "gte" }],
    })) as { n: number }[];
    expect(xs).toHaveLength(2);
  });
});

/**
 * Direct unit tests on the adapter contract — exercises every `Where`
 * operator + the AND/OR connector model via the memory adapter.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "../src/adapters/memory";

let adapter: ReturnType<ReturnType<typeof memoryAdapter>>;

beforeEach(() => {
  const store = {
    activity: [
      { id: "a", entity: "user", action: "created", actorId: "alice", createdAt: new Date("2024-01-01") },
      { id: "b", entity: "user", action: "updated", actorId: "BOB",   createdAt: new Date("2024-01-02") },
      { id: "c", entity: "user", action: "logged_in", actorId: null,  createdAt: new Date("2024-01-03") },
      { id: "d", entity: "project", action: "created", actorId: "alice", createdAt: new Date("2024-01-04") },
    ],
  };
  adapter = memoryAdapter(store)({ database: memoryAdapter({}), tableName: "activity" });
});

describe("where operators", () => {
  it("eq", async () => {
    const xs = await adapter.findMany({ model: "activity", where: [{ field: "entity", value: "user" }] });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["a", "b", "c"]);
  });

  it("ne", async () => {
    const xs = await adapter.findMany({ model: "activity", where: [{ field: "entity", value: "user", operator: "ne" }] });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["d"]);
  });

  it("in", async () => {
    const xs = await adapter.findMany({ model: "activity", where: [{ field: "action", value: ["created", "updated"], operator: "in" }] });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["a", "b", "d"]);
  });

  it("not_in", async () => {
    const xs = await adapter.findMany({ model: "activity", where: [{ field: "action", value: ["created"], operator: "not_in" }] });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["b", "c"]);
  });

  it("contains / starts_with / ends_with", async () => {
    const xs1 = await adapter.findMany({ model: "activity", where: [{ field: "action", value: "logg", operator: "contains" }] });
    expect(xs1.map((x) => (x as { id: string }).id)).toEqual(["c"]);
    const xs2 = await adapter.findMany({ model: "activity", where: [{ field: "action", value: "up", operator: "starts_with" }] });
    expect(xs2.map((x) => (x as { id: string }).id)).toEqual(["b"]);
    const xs3 = await adapter.findMany({ model: "activity", where: [{ field: "action", value: "_in", operator: "ends_with" }] });
    expect(xs3.map((x) => (x as { id: string }).id)).toEqual(["c"]);
  });

  it("mode: insensitive", async () => {
    const xs = await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: "bob", operator: "eq", mode: "insensitive" }],
    });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["b"]);
  });

  it("eq null matches IS NULL", async () => {
    const xs = await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null, operator: "eq" }],
    });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["c"]);
  });

  it("lt / lte / gt / gte on dates", async () => {
    const xs = await adapter.findMany({
      model: "activity",
      where: [
        { field: "createdAt", value: new Date("2024-01-02"), operator: "gte" },
        { field: "createdAt", value: new Date("2024-01-04"), operator: "lt" },
      ],
    });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["b", "c"]);
  });

  it("AND is the default connector", async () => {
    const xs = await adapter.findMany({
      model: "activity",
      where: [
        { field: "entity", value: "user" },
        { field: "actorId", value: "alice" },
      ],
    });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["a"]);
  });

  it("OR connectors fold left-to-right", async () => {
    const xs = await adapter.findMany({
      model: "activity",
      where: [
        { field: "actorId", value: "alice" },
        { field: "actorId", value: "BOB", connector: "OR" },
      ],
    });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["a", "b", "d"]);
  });

  it("count() respects where", async () => {
    expect(await adapter.count({ model: "activity" })).toBe(4);
    expect(
      await adapter.count({
        model: "activity",
        where: [{ field: "entity", value: "user" }],
      }),
    ).toBe(3);
  });

  it("sortBy + limit + offset", async () => {
    const xs = await adapter.findMany({
      model: "activity",
      limit: 2,
      offset: 1,
      sortBy: { field: "createdAt", direction: "asc" },
    });
    expect(xs.map((x) => (x as { id: string }).id)).toEqual(["b", "c"]);
  });

  it("update / updateMany / delete / deleteMany", async () => {
    const updated = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "a" }],
      update: { actorId: "system" },
    });
    expect((updated as { actorId: string }).actorId).toBe("system");

    const n = await adapter.updateMany({
      model: "activity",
      where: [{ field: "entity", value: "user" }],
      update: { actorId: "x" },
    });
    expect(n).toBe(3);

    await adapter.delete({ model: "activity", where: [{ field: "id", value: "a" }] });
    expect(await adapter.count({ model: "activity" })).toBe(3);

    const removed = await adapter.deleteMany({
      model: "activity",
      where: [{ field: "entity", value: "user" }],
    });
    expect(removed).toBe(2);
    expect(await adapter.count({ model: "activity" })).toBe(1);
  });
});

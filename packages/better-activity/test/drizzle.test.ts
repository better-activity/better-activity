import { describe, expect, it, vi } from "vitest";
import { drizzleAdapter } from "../src/adapters/drizzle";
import { betterActivity } from "../src/better-activity";

interface Recorder {
  inserts: Record<string, unknown>[];
  whereCalls: unknown[];
  setCalls: Record<string, unknown>[];
  orderBys: unknown[];
  limits: number[];
  offsets: number[];
}

/**
 * Fake table — a Proxy that returns a marker object for any column access.
 * Drizzle's `eq`, `ne`, etc. accept any value, so the marker objects flow
 * through unchanged.
 */
function fakeTable(): unknown {
  return new Proxy(
    {},
    {
      get: (_target, key) => ({ __column: String(key) }),
    },
  );
}

/**
 * Fake Drizzle DB. Each builder is a thenable so `await q` works on every
 * step in the chain.
 */
function fakeDb(opts: { rows?: Record<string, unknown>[] } = {}): { db: unknown; recorder: Recorder } {
  const { rows = [] } = opts;
  const recorder: Recorder = {
    inserts: [],
    whereCalls: [],
    setCalls: [],
    orderBys: [],
    limits: [],
    offsets: [],
  };

  function makeBuilder(returnRows: Record<string, unknown>[]) {
    const builder = {
      where(w: unknown) {
        recorder.whereCalls.push(w);
        return builder;
      },
      orderBy(o: unknown) {
        recorder.orderBys.push(o);
        return builder;
      },
      limit(n: number) {
        recorder.limits.push(n);
        return builder;
      },
      offset(n: number) {
        recorder.offsets.push(n);
        return builder;
      },
      returning() {
        return Promise.resolve(returnRows);
      },
      then(onF: (rows: Record<string, unknown>[]) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(returnRows).then(onF, onR);
      },
    };
    return builder;
  }

  const db = {
    insert: () => ({
      values: (data: Record<string, unknown> | Record<string, unknown>[]) => {
        if (Array.isArray(data)) recorder.inserts.push(...data);
        else recorder.inserts.push(data);
        return {
          returning: async () => (Array.isArray(data) ? data : [data]),
        };
      },
    }),
    select: (_arg?: unknown) => ({
      from: () => makeBuilder(rows),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => {
        recorder.setCalls.push(data);
        return makeBuilder(rows);
      },
    }),
    delete: () => makeBuilder(rows),
  };

  return { db, recorder };
}

const buildActivity = (db: unknown, table: unknown) =>
  betterActivity({
    database: drizzleAdapter({ db, table }),
    entities: { user: { actions: ["created", "logged_in"] } },
  });

describe("drizzleAdapter", () => {
  it("save() inserts and returns the first row", async () => {
    const table = fakeTable();
    const { db, recorder } = fakeDb({ rows: [{ id: "act_x", entity: "user" }] });
    const a = buildActivity(db, table);
    const r = await a.save({
      entity: "user",
      entityId: "u1",
      action: "logged_in",
    });
    expect(r.id).toMatch(/^act_/);
    expect(recorder.inserts).toHaveLength(1);
  });

  it("saveMany() short-circuits empty input", async () => {
    const table = fakeTable();
    const { db } = fakeDb();
    const a = buildActivity(db, table);
    expect(await a.saveMany([])).toEqual([]);
  });

  it("saveMany() inserts an array via values()", async () => {
    const table = fakeTable();
    const { db, recorder } = fakeDb();
    const a = buildActivity(db, table);
    await a.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    expect(recorder.inserts).toHaveLength(2);
  });

  it("findMany applies where, orderBy, limit, offset", async () => {
    const table = fakeTable();
    const { db, recorder } = fakeDb({ rows: [{ id: "x" }] });
    const a = buildActivity(db, table);
    await a.list({ entity: "user", limit: 5, offset: 2, sortBy: "asc" });
    expect(recorder.whereCalls.length).toBeGreaterThan(0);
    expect(recorder.orderBys).toHaveLength(1);
    expect(recorder.limits[0]).toBe(5);
    expect(recorder.offsets[0]).toBe(2);
  });

  it("findOne returns null when no rows match", async () => {
    const table = fakeTable();
    const { db } = fakeDb({ rows: [] });
    const adapter = drizzleAdapter({ db, table })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(r).toBeNull();
  });

  it("count() returns the count from the row", async () => {
    const table = fakeTable();
    const { db } = fakeDb({ rows: [{ count: 12 }] });
    const a = buildActivity(db, table);
    expect(await a.count()).toBe(12);
  });

  it("update + updateMany return rows / row count", async () => {
    const table = fakeTable();
    const { db } = fakeDb({ rows: [{ id: "x", actorId: "y" }] });
    const adapter = drizzleAdapter({ db, table })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(r).toEqual({ id: "x", actorId: "y" });

    const n = await adapter.updateMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(n).toBe(1);
  });

  it("update returns null when no rows match", async () => {
    const table = fakeTable();
    const { db } = fakeDb({ rows: [] });
    const adapter = drizzleAdapter({ db, table })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(r).toBeNull();
  });

  it("delete + deleteMany work", async () => {
    const table = fakeTable();
    const { db } = fakeDb({ rows: [{ id: "x" }] });
    const adapter = drizzleAdapter({ db, table })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    const n = await adapter.deleteMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(n).toBe(1);
  });

  it("translates every where operator without throwing", async () => {
    const table = fakeTable();
    const { db, recorder } = fakeDb();
    const adapter = drizzleAdapter({ db, table })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const ops = [
      { field: "actorId", value: null },
      { field: "actorId", value: null, operator: "ne" as const },
      { field: "entity", value: "u" },
      { field: "entity", value: "u", operator: "ne" as const },
      { field: "v", value: 1, operator: "lt" as const },
      { field: "v", value: 1, operator: "lte" as const },
      { field: "v", value: 1, operator: "gt" as const },
      { field: "v", value: 1, operator: "gte" as const },
      { field: "a", value: ["a"], operator: "in" as const },
      { field: "a", value: ["a"], operator: "not_in" as const },
      { field: "a", value: "x", operator: "contains" as const },
      { field: "a", value: "x", operator: "starts_with" as const },
      { field: "a", value: "x", operator: "ends_with" as const },
      { field: "a", value: "x", operator: "contains" as const, mode: "insensitive" as const },
      { field: "a", value: "x", operator: "starts_with" as const, mode: "insensitive" as const },
      { field: "a", value: "x", operator: "ends_with" as const, mode: "insensitive" as const },
    ];
    for (const w of ops) {
      await adapter.findOne({ model: "activity", where: [w] });
    }
    expect(recorder.whereCalls.length).toBe(ops.length);
  });

  it("AND / OR clauses fold via and()/or()", async () => {
    const table = fakeTable();
    const { db, recorder } = fakeDb();
    const adapter = drizzleAdapter({ db, table })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findOne({
      model: "activity",
      where: [
        { field: "entity", value: "u" },
        { field: "actorId", value: "x" },
      ],
    });
    await adapter.findOne({
      model: "activity",
      where: [
        { field: "actorId", value: "a" },
        { field: "actorId", value: "b", connector: "OR" },
      ],
    });
    expect(recorder.whereCalls.length).toBe(2);
  });

  it("debug logs are written when enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const table = fakeTable();
      const { db } = fakeDb({ rows: [{ id: "x" }] });
      const a = betterActivity({
        database: drizzleAdapter({ db, table, debugLogs: true }),
        entities: { user: { actions: ["created"] } },
      });
      await a.save({ entity: "user", entityId: "u1", action: "created" });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });

  it("dialect=sqlite disables boolean support in the factory", async () => {
    const table = fakeTable();
    const { db } = fakeDb({ rows: [{ id: "x", flag: 1 }] });
    const a = betterActivity({
      database: drizzleAdapter({ db, table, dialect: "sqlite" }),
      entities: { user: { actions: ["created"] } },
    });
    expect(a.adapter.id).toBe("drizzle-sqlite");
  });
});

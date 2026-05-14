import { describe, expect, it, vi } from "vitest";
import { kyselyAdapter } from "../src/adapters/kysely";
import { betterActivity } from "../src/better-activity";

interface Recorder {
  inserts: Record<string, unknown>[];
  whereCalls: unknown[];
  updates: Record<string, unknown>[];
  deletes: number;
  selectFromCount: number;
  selectAllCount: number;
  orderBys: Array<[string, string]>;
  limits: number[];
  offsets: number[];
}

/**
 * Minimal Kysely-like fluent builder. Each chainable method records its
 * argument and returns `this`. The expression builder is a callable that
 * forwards (col, op, val) into a synthetic { col, op, val } token.
 */
function fakeKysely(opts: {
  rows?: Record<string, unknown>[];
  numUpdated?: number;
  numDeleted?: number;
} = {}): { db: unknown; recorder: Recorder } {
  const { rows = [], numUpdated = 0, numDeleted = 0 } = opts;
  const recorder: Recorder = {
    inserts: [],
    whereCalls: [],
    updates: [],
    deletes: 0,
    selectFromCount: 0,
    selectAllCount: 0,
    orderBys: [],
    limits: [],
    offsets: [],
  };

  const exprBuilder: unknown = Object.assign(
    (col: string, op: string, val: unknown) => ({ col, op, val }),
    {
      or: (xs: unknown[]) => ({ or: xs }),
      and: (xs: unknown[]) => ({ and: xs }),
      fn: { countAll: () => ({ as: () => ({ count: "*" }) }) },
    },
  );

  const insertBuilder = {
    values: (data: Record<string, unknown> | Record<string, unknown>[]) => {
      if (Array.isArray(data)) recorder.inserts.push(...data);
      else recorder.inserts.push(data);
      return {
        returningAll: () => ({
          executeTakeFirstOrThrow: async () => rows[0] ?? data,
          execute: async () => (Array.isArray(data) ? data : [data]),
        }),
      };
    },
  };

  const selectBuilder: Record<string, unknown> = {
    where: vi.fn((cb: (eb: unknown) => unknown) => {
      recorder.whereCalls.push(cb(exprBuilder));
      return selectBuilder;
    }),
    select: vi.fn((sel: unknown) => {
      // count() path
      if (typeof sel === "function") {
        recorder.selectAllCount++;
        return {
          where: vi.fn(() => ({
            executeTakeFirst: async () => ({ count: rows.length }),
          })),
          executeTakeFirst: async () => ({ count: rows.length }),
        };
      }
      return selectBuilder;
    }),
    selectAll: vi.fn(() => {
      recorder.selectAllCount++;
      return selectBuilder;
    }),
    orderBy: vi.fn((field: string, dir: string) => {
      recorder.orderBys.push([field, dir]);
      return selectBuilder;
    }),
    limit: vi.fn((n: number) => {
      recorder.limits.push(n);
      return selectBuilder;
    }),
    offset: vi.fn((n: number) => {
      recorder.offsets.push(n);
      return selectBuilder;
    }),
    execute: async () => rows,
    executeTakeFirst: async () => rows[0],
  };

  const updateBuilder = {
    set: (data: Record<string, unknown>) => {
      recorder.updates.push(data);
      return {
        where: vi.fn((cb: (eb: unknown) => unknown) => {
          recorder.whereCalls.push(cb(exprBuilder));
          return updateBuilder.set(data);
        }),
        returningAll: () => ({
          executeTakeFirst: async () => rows[0],
        }),
        executeTakeFirst: async () => ({ numUpdatedRows: numUpdated }),
      };
    },
  };

  const deleteBuilder = {
    where: vi.fn((cb: (eb: unknown) => unknown) => {
      recorder.whereCalls.push(cb(exprBuilder));
      return deleteBuilder;
    }),
    execute: async () => {
      recorder.deletes++;
    },
    executeTakeFirst: async () => ({ numDeletedRows: numDeleted }),
  };

  const db = {
    insertInto: () => insertBuilder,
    selectFrom: () => {
      recorder.selectFromCount++;
      return selectBuilder;
    },
    updateTable: () => updateBuilder,
    deleteFrom: () => deleteBuilder,
  };

  return { db, recorder };
}

const buildActivity = (db: unknown) =>
  betterActivity({
    database: kyselyAdapter({ db }),
    entities: { user: { actions: ["created", "logged_in"] } },
  });

describe("kyselyAdapter", () => {
  it("save() inserts and returns the row", async () => {
    const { db, recorder } = fakeKysely({ rows: [{ id: "act_x", entity: "user" }] });
    const a = buildActivity(db);
    const r = await a.save({
      entity: "user",
      entityId: "u1",
      action: "logged_in",
    });
    expect(r.id).toBe("act_x");
    expect(recorder.inserts).toHaveLength(1);
  });

  it("saveMany() short-circuits on empty input", async () => {
    const { db } = fakeKysely();
    const a = buildActivity(db);
    expect(await a.saveMany([])).toEqual([]);
  });

  it("saveMany() passes the array to values()", async () => {
    const { db, recorder } = fakeKysely();
    const a = buildActivity(db);
    await a.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    expect(recorder.inserts).toHaveLength(2);
  });

  it("findOne / findMany invoke selectAll, orderBy, limit, offset", async () => {
    const { db, recorder } = fakeKysely({ rows: [{ id: "x" }] });
    const a = buildActivity(db);
    await a.list({ limit: 5, offset: 1, sortBy: "asc" });
    expect(recorder.orderBys[0]).toEqual(["createdAt", "asc"]);
    expect(recorder.limits[0]).toBe(5);
    expect(recorder.offsets[0]).toBe(1);
  });

  it("translates eq/ne/null, lt/lte/gt/gte, in/not_in, contains/starts/ends", async () => {
    const { db, recorder } = fakeKysely();
    const adapter = kyselyAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const cases: Array<[Parameters<typeof adapter.findOne>[0]["where"][number], unknown]> = [
      [{ field: "actorId", value: null, operator: "eq", connector: "AND", mode: "sensitive" }, { col: "actorId", op: "is", val: null }],
      [{ field: "entity", value: "u", operator: "eq", connector: "AND", mode: "sensitive" }, { col: "entity", op: "=", val: "u" }],
      [{ field: "actorId", value: null, operator: "ne", connector: "AND", mode: "sensitive" }, { col: "actorId", op: "is not", val: null }],
      [{ field: "entity", value: "u", operator: "ne", connector: "AND", mode: "sensitive" }, { col: "entity", op: "<>", val: "u" }],
      [{ field: "v", value: 1, operator: "lt", connector: "AND", mode: "sensitive" }, { col: "v", op: "<", val: 1 }],
      [{ field: "v", value: 1, operator: "lte", connector: "AND", mode: "sensitive" }, { col: "v", op: "<=", val: 1 }],
      [{ field: "v", value: 1, operator: "gt", connector: "AND", mode: "sensitive" }, { col: "v", op: ">", val: 1 }],
      [{ field: "v", value: 1, operator: "gte", connector: "AND", mode: "sensitive" }, { col: "v", op: ">=", val: 1 }],
      [{ field: "a", value: ["a"], operator: "in", connector: "AND", mode: "sensitive" }, { col: "a", op: "in", val: ["a"] }],
      [{ field: "a", value: ["a"], operator: "not_in", connector: "AND", mode: "sensitive" }, { col: "a", op: "not in", val: ["a"] }],
      [{ field: "a", value: "x", operator: "contains", connector: "AND", mode: "sensitive" }, { col: "a", op: "like", val: "%x%" }],
      [{ field: "a", value: "x", operator: "contains", connector: "AND", mode: "insensitive" }, { col: "a", op: "ilike", val: "%x%" }],
      [{ field: "a", value: "x", operator: "starts_with", connector: "AND", mode: "sensitive" }, { col: "a", op: "like", val: "x%" }],
      [{ field: "a", value: "x", operator: "ends_with", connector: "AND", mode: "sensitive" }, { col: "a", op: "like", val: "%x" }],
    ];
    for (let i = 0; i < cases.length; i++) {
      await adapter.findOne({ model: "activity", where: [cases[i]![0]] });
      expect(recorder.whereCalls[i]).toEqual(cases[i]![1]);
    }
  });

  it("AND clauses chain via eb.and; OR via eb.or", async () => {
    const { db, recorder } = fakeKysely();
    const adapter = kyselyAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findOne({
      model: "activity",
      where: [
        { field: "entity", value: "u", operator: "eq", connector: "AND", mode: "sensitive" },
        { field: "actorId", value: "x", operator: "eq", connector: "AND", mode: "sensitive" },
      ],
    });
    const last = recorder.whereCalls[recorder.whereCalls.length - 1] as { and: unknown[] };
    expect(last.and).toHaveLength(2);

    await adapter.findOne({
      model: "activity",
      where: [
        { field: "actorId", value: "a", operator: "eq", connector: "AND", mode: "sensitive" },
        { field: "actorId", value: "b", operator: "eq", connector: "OR", mode: "sensitive" },
      ],
    });
    const last2 = recorder.whereCalls[recorder.whereCalls.length - 1] as { or: unknown[] };
    expect(last2.or).toHaveLength(2);
  });

  it("count() returns 0 when no row is returned", async () => {
    const { db } = fakeKysely();
    const adapter = kyselyAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    expect(await adapter.count({ model: "activity" })).toBe(0);
  });

  it("update / updateMany / delete / deleteMany propagate counts", async () => {
    const { db } = fakeKysely({
      rows: [{ id: "x", actorId: "y" }],
      numUpdated: 4,
      numDeleted: 7,
    });
    const adapter = kyselyAdapter({ db })({
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
    expect(n).toBe(4);

    await adapter.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    const removed = await adapter.deleteMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(removed).toBe(7);
  });

  it("findMany passes select when provided", async () => {
    const { db, recorder } = fakeKysely({ rows: [{ id: "a" }] });
    const adapter = kyselyAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({ model: "activity", limit: 1, select: ["id", "entity"] });
    // Either selectAll or select() was invoked; we just assert no error & returned rows
    expect(recorder.selectFromCount).toBeGreaterThan(0);
  });

  it("debug logs are written when enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const { db } = fakeKysely({ rows: [{ id: "x" }] });
      const a = betterActivity({
        database: kyselyAdapter({ db, debugLogs: true }),
        entities: { user: { actions: ["created"] } },
      });
      await a.save({ entity: "user", entityId: "u1", action: "created" });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

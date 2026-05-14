import { describe, expect, it, vi } from "vitest";
import { mysqlAdapter, type MySQLLike } from "../src/adapters/mysql";
import { betterActivity } from "../src/better-activity";

interface RecordedCall {
  sql: string;
  values?: unknown[];
}

function fakePool(opts: {
  rowsFor?: (sql: string) => Record<string, unknown>[];
  shape?: "tuple" | "object";
  affected?: number;
} = {}): MySQLLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const { rowsFor = () => [], shape = "tuple", affected = 0 } = opts;
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      const rows = rowsFor(sql);
      if (shape === "tuple") {
        // mysql2/promise returns [rows, fields].
        return [rows] as never;
      }
      return { rows, affectedRows: affected } as never;
    }),
  };
}

const buildActivity = (pool: ReturnType<typeof fakePool>) =>
  betterActivity({
    database: mysqlAdapter({ pool }),
    entities: { user: { actions: ["created", "logged_in"] } },
  });

describe("mysqlAdapter — SQL generation", () => {
  it("save() emits a parameterized INSERT INTO `activity`", async () => {
    const pool = fakePool();
    const activity = buildActivity(pool);
    await activity.save({
      entity: "user",
      entityId: "u1",
      action: "logged_in",
      metadata: { ip: "1.1.1.1" } as never,
    });
    const insert = pool.calls.find((c) => c.sql.startsWith("INSERT"))!;
    expect(insert.sql).toContain("INTO `activity`");
    expect(insert.values).toContain('{"ip":"1.1.1.1"}');
  });

  it("saveMany() bulk inserts and short-circuits empty", async () => {
    const pool = fakePool();
    const activity = buildActivity(pool);
    const empty = await activity.saveMany([]);
    expect(empty).toEqual([]);
    await activity.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    const insert = pool.calls.find((c) => c.sql.startsWith("INSERT"))!;
    expect(insert.sql).toMatch(/VALUES \(.+\), \(.+\)/);
  });

  it("list() builds SELECT … LIMIT/OFFSET with backtick-quoted columns", async () => {
    const pool = fakePool();
    const activity = buildActivity(pool);
    await activity.list({ entity: "user", limit: 5, offset: 2 });
    const sel = pool.calls.find((c) => c.sql.startsWith("SELECT"))!;
    expect(sel.sql).toContain("FROM `activity`");
    expect(sel.sql).toContain("WHERE `entity` = ?");
    expect(sel.sql).toContain("LIMIT 5");
    expect(sel.sql).toContain("OFFSET 2");
  });

  it("count() reads from object-shaped responses too", async () => {
    const pool = fakePool({
      rowsFor: (sql) => (sql.startsWith("SELECT COUNT") ? [{ count: 9 }] : []),
      shape: "object",
    });
    const activity = buildActivity(pool);
    expect(await activity.count()).toBe(9);
  });

  it("count() reads from tuple-shaped responses", async () => {
    const pool = fakePool({
      rowsFor: (sql) => (sql.startsWith("SELECT COUNT") ? [{ count: 4 }] : []),
    });
    const activity = buildActivity(pool);
    expect(await activity.count()).toBe(4);
  });

  it("findOne() returns null when no rows came back", async () => {
    const adapter = mysqlAdapter({ pool: fakePool() })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(r).toBeNull();
  });

  it("update() round-trips a SELECT to surface the row", async () => {
    const pool = fakePool({
      rowsFor: (sql) => (sql.startsWith("SELECT") ? [{ id: "x", actorId: "y" }] : []),
    });
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = (await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    })) as { actorId: string };
    expect(r.actorId).toBe("y");
    expect(pool.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(true);
  });

  it("update() returns null when nothing matches", async () => {
    const adapter = mysqlAdapter({ pool: fakePool() })({
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

  it("updateMany() reports affected rows from object response", async () => {
    const pool = fakePool({ shape: "object", affected: 3 });
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const n = await adapter.updateMany({
      model: "activity",
      where: [{ field: "entity", value: "user" }],
      update: { actorId: "y" },
    });
    expect(n).toBe(3);
  });

  it("delete + deleteMany emit DELETE FROM `activity` ", async () => {
    const pool = fakePool({ shape: "object", affected: 2 });
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(pool.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(true);
    const n = await adapter.deleteMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(n).toBe(2);
  });

  it("createSchema() emits MySQL DDL", async () => {
    const pool = fakePool();
    const opts = { database: () => ({}) as never, tableName: "activity" };
    const adapter = mysqlAdapter({ pool })(opts);
    const s = await adapter.createSchema!(opts);
    expect(s.code).toContain("DATETIME(3)");
    expect(s.path).toContain("mysql-activity.sql");
  });

  it("findMany / findOne project columns when select is provided", async () => {
    const pool = fakePool({ rowsFor: () => [{ id: "x" }] });
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      select: ["id"],
    });
    await adapter.findMany({
      model: "activity",
      where: [],
      select: ["id"],
    });
    const sels = pool.calls.filter((c) => c.sql.startsWith("SELECT `id`"));
    expect(sels.length).toBeGreaterThanOrEqual(2);
  });

  it("update serializes JSON metadata on the update path", async () => {
    const pool = fakePool({ rowsFor: (sql) => (sql.startsWith("SELECT") ? [{ id: "x" }] : []) });
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { metadata: { foo: "bar" } },
    });
    const update = pool.calls.find((c) => c.sql.startsWith("UPDATE"))!;
    expect(update.values).toContain('{"foo":"bar"}');
  });

  it("saveMany() bulk-serializes JSON metadata for each row", async () => {
    const pool = fakePool();
    const activity = buildActivity(pool);
    await activity.saveMany([
      { entity: "user", entityId: "u1", action: "created", metadata: { ip: "a" } as never },
      { entity: "user", entityId: "u2", action: "created", metadata: { ip: "b" } as never },
    ]);
    const insert = pool.calls.find((c) => c.sql.startsWith("INSERT"))!;
    expect(insert.values).toContain('{"ip":"a"}');
    expect(insert.values).toContain('{"ip":"b"}');
  });

  it("emits 1=0 / 1=1 for empty IN / NOT IN clauses", async () => {
    const pool = fakePool();
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: [], operator: "in" }],
    });
    expect(pool.calls[0]!.sql).toContain("1=0");
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: [], operator: "not_in" }],
    });
    expect(pool.calls[1]!.sql).toContain("1=1");
  });

  it("eq null / ne null become IS NULL / IS NOT NULL", async () => {
    const pool = fakePool();
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null }],
    });
    expect(pool.calls[0]!.sql).toContain("`actorId` IS NULL");
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null, operator: "ne" }],
    });
    expect(pool.calls[1]!.sql).toContain("`actorId` IS NOT NULL");
  });

  it("translates lt/lte/gt/gte/ne comparison operators", async () => {
    const pool = fakePool();
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const ops = ["lt", "lte", "gt", "gte", "ne"] as const;
    const expected = ["< ?", "<= ?", "> ?", ">= ?", "<> ?"];
    for (let i = 0; i < ops.length; i++) {
      await adapter.findMany({
        model: "activity",
        where: [{ field: "v", value: 1, operator: ops[i] }],
      });
      expect(pool.calls[i]!.sql).toContain(expected[i]!);
    }
  });

  it("findMany defaults LIMIT to 100", async () => {
    const pool = fakePool();
    const adapter = mysqlAdapter({ pool })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({ model: "activity" });
    expect(pool.calls[0]!.sql).toContain("LIMIT 100");
  });

  it("debug logs are written when enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const pool = fakePool();
      const activity = betterActivity({
        database: mysqlAdapter({ pool, debugLogs: true }),
        entities: { user: { actions: ["created"] } },
      });
      await activity.save({ entity: "user", entityId: "u1", action: "created" });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

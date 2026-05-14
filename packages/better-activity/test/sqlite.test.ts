import { describe, expect, it, vi } from "vitest";
import { sqliteAdapter, type SQLiteLike } from "../src/adapters/sqlite";
import { betterActivity } from "../src/better-activity";
import { generateSQLiteSQL } from "../src/migrations";
import { getActivityTable } from "../src/schema";

interface RecordedCall {
  sql: string;
  values: unknown[];
  method: "all" | "get" | "run";
}

/**
 * In-memory SQLite-like backend that records every prepared call. We don't
 * actually parse SQL — tests that need stored data feed it through `getRows`.
 */
function fakeDB(opts: {
  getRows?: (sql: string, values: unknown[]) => Record<string, unknown>[];
  changes?: number;
} = {}): SQLiteLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const { getRows = () => [], changes = 0 } = opts;
  return {
    calls,
    prepare(sql: string) {
      return {
        all(...values: unknown[]) {
          calls.push({ sql, values, method: "all" });
          return getRows(sql, values);
        },
        get(...values: unknown[]) {
          calls.push({ sql, values, method: "get" });
          return getRows(sql, values)[0];
        },
        run(...values: unknown[]) {
          calls.push({ sql, values, method: "run" });
          return { changes };
        },
      };
    },
  };
}

const buildActivity = (db: ReturnType<typeof fakeDB>) =>
  betterActivity({
    database: sqliteAdapter({ db }),
    entities: { user: { actions: ["created", "logged_in"] } },
  });

describe("sqliteAdapter — SQL generation", () => {
  it("save() prepares an INSERT with stringified JSON metadata + ISO date", async () => {
    const db = fakeDB();
    const activity = buildActivity(db);
    await activity.save({
      entity: "user",
      entityId: "u1",
      action: "logged_in",
      metadata: { ip: "1.2.3.4" } as never,
      createdAt: new Date("2024-05-10T00:00:00Z"),
    });
    const insert = db.calls.find((c) => c.sql.startsWith("INSERT"))!;
    expect(insert.method).toBe("run");
    expect(insert.values).toContain('{"ip":"1.2.3.4"}');
    expect(insert.values).toContain("2024-05-10T00:00:00.000Z");
  });

  it("saveMany() emits a multi-VALUES INSERT", async () => {
    const db = fakeDB();
    const activity = buildActivity(db);
    await activity.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    const insert = db.calls.find((c) => c.sql.startsWith("INSERT"))!;
    expect(insert.sql).toMatch(/VALUES \(.+\), \(.+\)/);
  });

  it("saveMany([]) is a no-op", async () => {
    const db = fakeDB();
    const activity = buildActivity(db);
    const out = await activity.saveMany([]);
    expect(out).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });

  it("findMany / list emits SELECT * FROM \"activity\" with WHERE + LIMIT", async () => {
    const db = fakeDB();
    const activity = buildActivity(db);
    await activity.list({ entity: "user", limit: 5, offset: 10 });
    const sel = db.calls.find((c) => c.sql.startsWith("SELECT"))!;
    expect(sel.sql).toContain('FROM "activity"');
    expect(sel.sql).toContain('WHERE "entity" = ?');
    expect(sel.sql).toContain("LIMIT 5");
    expect(sel.sql).toContain("OFFSET 10");
    expect(sel.sql).toMatch(/ORDER BY "createdAt" DESC/);
    expect(sel.values).toEqual(["user"]);
  });

  it("count() uses SELECT COUNT(*)", async () => {
    const db = fakeDB({ getRows: () => [{ count: 11 }] });
    const activity = buildActivity(db);
    expect(await activity.count({ entity: "user" })).toBe(11);
    const cnt = db.calls.find((c) => c.sql.startsWith("SELECT COUNT(*)"))!;
    expect(cnt).toBeDefined();
  });

  it("count() handles BigInt return values", async () => {
    const db = fakeDB({ getRows: () => [{ count: BigInt(42) }] });
    const activity = buildActivity(db);
    expect(await activity.count()).toBe(42);
  });

  it("findOne returns null when no rows match", async () => {
    const adapter = sqliteAdapter({ db: fakeDB() })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(r).toBeNull();
  });

  it("update + updateMany + delete + deleteMany prepare the right SQL", async () => {
    const db = fakeDB({ changes: 4, getRows: () => [{ id: "x" }] });
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(db.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(true);
    expect(
      await adapter.updateMany({
        model: "activity",
        where: [{ field: "entity", value: "user" }],
        update: { actorId: "y" },
      }),
    ).toBe(4);
    await adapter.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(db.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(true);
    expect(
      await adapter.deleteMany({
        model: "activity",
        where: [{ field: "id", value: "x" }],
      }),
    ).toBe(4);
  });

  it("debug logs are written when enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const db = fakeDB();
      const activity = betterActivity({
        database: sqliteAdapter({ db, debugLogs: true }),
        entities: { user: { actions: ["created"] } },
      });
      await activity.save({ entity: "user", entityId: "u1", action: "created" });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });

  it("createSchema() returns SQLite DDL with the requested file path", async () => {
    const db = fakeDB();
    const opts = { database: () => ({}) as never, tableName: "activity" };
    const adapter = sqliteAdapter({ db })(opts);
    const s = await adapter.createSchema!(opts, "/tmp/x.sql");
    expect(s.code).toContain("TEXT");
    expect(s.path).toBe("/tmp/x.sql");
  });

  it("createSchema() falls back to a default path", async () => {
    const db = fakeDB();
    const opts = { database: () => ({}) as never, tableName: "activity" };
    const adapter = sqliteAdapter({ db })(opts);
    const s = await adapter.createSchema!(opts);
    expect(s.path).toContain("sqlite-activity.sql");
  });

  it("findMany / findOne project columns when select is provided", async () => {
    const db = fakeDB({ getRows: () => [{ id: "x" }] });
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      select: ["id"],
    });
    expect(db.calls.find((c) => c.sql.startsWith("SELECT \"id\""))).toBeDefined();
    await adapter.findMany({
      model: "activity",
      where: [],
      select: ["id"],
    });
    const sels = db.calls.filter((c) => c.sql.startsWith("SELECT \"id\""));
    expect(sels.length).toBeGreaterThanOrEqual(2);
  });

  it("update serializes JSON metadata on the update path", async () => {
    const db = fakeDB({ getRows: () => [{ id: "x" }], changes: 1 });
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { metadata: { foo: "bar" } },
    });
    const update = db.calls.find((c) => c.sql.startsWith("UPDATE"))!;
    expect(update.values).toContain('{"foo":"bar"}');
  });

  it("saveMany() serializes JSON metadata for each row", async () => {
    const db = fakeDB();
    const activity = buildActivity(db);
    await activity.saveMany([
      { entity: "user", entityId: "u1", action: "created", metadata: { ip: "a" } as never },
      { entity: "user", entityId: "u2", action: "created", metadata: { ip: "b" } as never },
    ]);
    const insert = db.calls.find((c) => c.sql.startsWith("INSERT"))!;
    expect(insert.values).toContain('{"ip":"a"}');
    expect(insert.values).toContain('{"ip":"b"}');
  });

  it("emits 1=0 for empty IN, 1=1 for empty NOT IN", async () => {
    const db = fakeDB();
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: [], operator: "in" }],
    });
    expect(db.calls[0]!.sql).toContain("1=0");
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: [], operator: "not_in" }],
    });
    expect(db.calls[1]!.sql).toContain("1=1");
  });

  it("supports insensitive contains / starts / ends and IN / NOT IN", async () => {
    const db = fakeDB();
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "Log", operator: "contains", mode: "insensitive" }],
    });
    expect(db.calls[0]!.values).toContain("%log%");
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "Log", operator: "starts_with", mode: "insensitive" }],
    });
    expect(db.calls[1]!.values).toContain("log%");
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "In", operator: "ends_with", mode: "insensitive" }],
    });
    expect(db.calls[2]!.values).toContain("%in");
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: ["A", "B"], operator: "in", mode: "insensitive" }],
    });
    expect(db.calls[3]!.values).toEqual(["a", "b"]);
  });

  it("eq null / ne null become IS NULL / IS NOT NULL", async () => {
    const db = fakeDB();
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null }],
    });
    expect(db.calls[0]!.sql).toContain('"actorId" IS NULL');
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null, operator: "ne" }],
    });
    expect(db.calls[1]!.sql).toContain('"actorId" IS NOT NULL');
  });

  it("findMany defaults LIMIT to 100 when omitted", async () => {
    const db = fakeDB();
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({ model: "activity" });
    expect(db.calls[0]!.sql).toContain("LIMIT 100");
  });

  it("count() returns 0 when row is missing", async () => {
    const db = fakeDB();
    const adapter = sqliteAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    expect(await adapter.count({ model: "activity" })).toBe(0);
  });

  it("matches the reference DDL", () => {
    const ddl = generateSQLiteSQL(getActivityTable());
    expect(ddl).toContain('"id" TEXT PRIMARY KEY');
    expect(ddl).toContain('"createdAt" TEXT NOT NULL');
  });
});

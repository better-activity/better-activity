/**
 * Extra Postgres adapter coverage — exercises update, delete, deleteMany,
 * createSchema and the full WHERE-operator matrix.
 */

import { describe, expect, it, vi } from "vitest";
import { postgresAdapter, type PostgresPool } from "../src/adapters/postgres";

interface RecordedCall {
  sql: string;
  values?: unknown[];
}

function fakePool(opts: { rows?: Record<string, unknown>[]; rowCount?: number } = {}): PostgresPool & {
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const { rows = [], rowCount = rows.length } = opts;
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows, rowCount };
    }),
  };
}

const buildAdapter = (pool: PostgresPool) =>
  postgresAdapter({ pool })({
    database: () => ({}) as never,
    tableName: "activity",
  });

describe("postgresAdapter — extra coverage", () => {
  it("update emits UPDATE … SET … WHERE … RETURNING *", async () => {
    const pool = fakePool({ rows: [{ id: "x", actorId: "y" }] });
    const adapter = buildAdapter(pool);
    const r = (await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    })) as { actorId: string };
    expect(r.actorId).toBe("y");
    const sql = pool.calls[0]!.sql;
    expect(sql).toMatch(/^UPDATE "activity" SET "actorId" = \$1 WHERE "id" = \$2 RETURNING \*/);
  });

  it("update returns null when no rows match", async () => {
    const adapter = buildAdapter(fakePool({ rows: [] }));
    const r = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(r).toBeNull();
  });

  it("update serializes JSON-valued metadata", async () => {
    const pool = fakePool({ rows: [{ id: "x" }] });
    const adapter = buildAdapter(pool);
    await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { metadata: { ip: "1.1.1.1" } },
    });
    expect(pool.calls[0]!.values).toContain('{"ip":"1.1.1.1"}');
  });

  it("updateMany returns affected row count", async () => {
    const pool = fakePool({ rowCount: 4 });
    const adapter = buildAdapter(pool);
    const n = await adapter.updateMany({
      model: "activity",
      where: [{ field: "entity", value: "user" }],
      update: { actorId: "y" },
    });
    expect(n).toBe(4);
  });

  it("delete emits DELETE FROM \"activity\" WHERE …", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(pool.calls[0]!.sql).toMatch(/^DELETE FROM "activity" WHERE "id" = \$1$/);
  });

  it("deleteMany returns affected row count", async () => {
    const pool = fakePool({ rowCount: 9 });
    const adapter = buildAdapter(pool);
    const n = await adapter.deleteMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(n).toBe(9);
  });

  it("findOne returns null when no rows", async () => {
    const adapter = buildAdapter(fakePool({ rows: [] }));
    const r = await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(r).toBeNull();
  });

  it("createSchema returns Postgres DDL with overridable file path", async () => {
    const pool = fakePool();
    const opts = { database: () => ({}) as never, tableName: "activity" };
    const adapter = postgresAdapter({ pool })(opts);
    const s = await adapter.createSchema!(opts, "/tmp/x.sql");
    expect(s.code).toContain("TIMESTAMPTZ");
    expect(s.path).toBe("/tmp/x.sql");
  });

  it("createSchema falls back to a default path", async () => {
    const pool = fakePool();
    const opts = { database: () => ({}) as never, tableName: "activity" };
    const adapter = postgresAdapter({ pool })(opts);
    const s = await adapter.createSchema!(opts);
    expect(s.path).toContain("postgres-activity.sql");
  });

  it("uses ANY(…) / ALL(…) for in / not_in", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: ["a", "b"], operator: "in" }],
    });
    expect(pool.calls[0]!.sql).toMatch(/"action" = ANY\(\$1\)/);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: ["a"], operator: "not_in" }],
    });
    expect(pool.calls[1]!.sql).toMatch(/"action" <> ALL\(\$1\)/);
  });

  it("emits LIKE / ILIKE patterns for contains / starts_with / ends_with", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "contains" }],
    });
    expect(pool.calls[0]!.values).toContain("%log%");
    expect(pool.calls[0]!.sql).toMatch(/"action" LIKE \$1/);

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "starts_with", mode: "insensitive" }],
    });
    expect(pool.calls[1]!.values).toContain("log%");
    expect(pool.calls[1]!.sql).toMatch(/"action" ILIKE \$1/);

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "ends_with", mode: "insensitive" }],
    });
    expect(pool.calls[2]!.values).toContain("%log");
    expect(pool.calls[2]!.sql).toMatch(/"action" ILIKE \$1/);
  });

  it("eq null / ne null become IS NULL / IS NOT NULL", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null }],
    });
    expect(pool.calls[0]!.sql).toMatch(/"actorId" IS NULL/);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: null, operator: "ne" }],
    });
    expect(pool.calls[1]!.sql).toMatch(/"actorId" IS NOT NULL/);
  });

  it("LOWER(…) is applied for case-insensitive comparisons", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: "BOB", mode: "insensitive" }],
    });
    expect(pool.calls[0]!.sql).toContain('LOWER("actorId")');
    expect(pool.calls[0]!.sql).toContain("LOWER($1)");
  });

  it("handles all comparison operators (lt, lte, gt, gte, ne)", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "lt" }],
    });
    expect(pool.calls[0]!.sql).toMatch(/< \$1/);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "lte" }],
    });
    expect(pool.calls[1]!.sql).toMatch(/<= \$1/);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "gt" }],
    });
    expect(pool.calls[2]!.sql).toMatch(/> \$1/);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "gte" }],
    });
    expect(pool.calls[3]!.sql).toMatch(/>= \$1/);
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "ne" }],
    });
    expect(pool.calls[4]!.sql).toMatch(/<> \$1/);
  });

  it("OR connector appears verbatim in the WHERE clause", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      where: [
        { field: "actorId", value: "alice" },
        { field: "actorId", value: "bob", connector: "OR" },
      ],
    });
    expect(pool.calls[0]!.sql).toContain("OR");
  });

  it("findMany defaults LIMIT to 100", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.findMany({ model: "activity" });
    expect(pool.calls[0]!.sql).toContain("LIMIT 100");
  });

  it("count() returns 0 when no row is returned", async () => {
    const pool = fakePool({ rows: [] });
    const adapter = buildAdapter(pool);
    expect(await adapter.count({ model: "activity" })).toBe(0);
  });

  it("findOne supports column projection", async () => {
    const pool = fakePool({ rows: [{ id: "x" }] });
    const adapter = buildAdapter(pool);
    await adapter.findOne({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      select: ["id", "entity"],
    });
    expect(pool.calls[0]!.sql).toMatch(/SELECT "id", "entity"/);
  });

  it("createMany builds a multi-VALUES INSERT … RETURNING *", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.createMany({
      model: "activity",
      data: [
        { id: "a", entity: "user", entityId: "u1", action: "created" },
        { id: "b", entity: "user", entityId: "u2", action: "created" },
      ],
    });
    const insert = pool.calls[0]!;
    expect(insert.sql).toMatch(/^INSERT INTO "activity" .+ VALUES \(.+\), \(.+\) RETURNING \*/);
    expect(insert.values).toContain("a");
    expect(insert.values).toContain("b");
  });

  it("createMany([]) returns [] without hitting the pool", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    expect(await adapter.createMany({ model: "activity", data: [] })).toEqual([]);
    expect(pool.calls).toHaveLength(0);
  });

  it("createMany serializes JSON metadata for each row", async () => {
    const pool = fakePool();
    const adapter = buildAdapter(pool);
    await adapter.createMany({
      model: "activity",
      data: [
        { id: "a", entity: "user", metadata: { ip: "1" } },
        { id: "b", entity: "user", metadata: '{"already":"json"}' },
      ],
    });
    expect(pool.calls[0]!.values).toContain('{"ip":"1"}');
    expect(pool.calls[0]!.values).toContain('{"already":"json"}');
  });

  it("findMany projects when select is given", async () => {
    const pool = fakePool({ rows: [{ id: "a" }] });
    const adapter = buildAdapter(pool);
    await adapter.findMany({
      model: "activity",
      select: ["id", "entity"],
    });
    expect(pool.calls[0]!.sql).toMatch(/SELECT "id", "entity"/);
  });

  it("debug logs fire when adapter-level debugLogs is on", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const pool = fakePool({ rows: [{ id: "x" }] });
      const adapter = postgresAdapter({ pool, debugLogs: true })({
        database: () => ({}) as never,
        tableName: "activity",
      });
      await adapter.create({ model: "activity", data: { id: "x" } });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

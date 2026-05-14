/**
 * Postgres adapter SQL-generation tests.
 *
 * We don't connect to a real database — we feed a fake `Pool` that records
 * every `query` call so we can assert on the SQL + parameter values.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { betterActivity } from "../src/better-activity";
import { postgresAdapter } from "../src/adapters/postgres";
import { generatePostgresSQL } from "../src/migrations";
import { getActivityTable } from "../src/schema";

interface RecordedCall {
  sql: string;
  values?: unknown[];
}

function fakePool(rowsFor: (sql: string) => Record<string, unknown>[] = () => []) {
  const calls: RecordedCall[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      const rows = rowsFor(sql);
      return { rows, rowCount: rows.length };
    }),
  };
}

const buildActivity = (pool: ReturnType<typeof fakePool>) =>
  betterActivity({
    database: postgresAdapter({ pool }),
    entities: { user: { actions: ["created", "logged_in"] } },
  });

describe("postgresAdapter — SQL generation", () => {
  let pool: ReturnType<typeof fakePool>;

  beforeEach(() => {
    pool = fakePool();
  });

  it("save() emits a parameterized INSERT … RETURNING *", async () => {
    pool = fakePool((sql) =>
      sql.startsWith("INSERT")
        ? [
            {
              id: "act_xyz",
              entity: "user",
              entityId: "u1",
              action: "logged_in",
              actorId: "u1",
              actorType: null,
              metadata: { ip: "1.2.3.4" },
              ip: null,
              userAgent: null,
              requestId: null,
              createdAt: new Date(),
            },
          ]
        : [],
    );
    const activity = buildActivity(pool);
    const r = await activity.save({
      entity: "user",
      entityId: "u1",
      action: "logged_in",
      metadata: { ip: "1.2.3.4" } as never,
    });
    expect(r.id).toBe("act_xyz");
    const [call] = pool.calls;
    expect(call!.sql).toMatch(/^INSERT INTO "activity"/);
    expect(call!.sql).toContain("RETURNING *");
    expect(call!.values).toBeInstanceOf(Array);
    expect(call!.values).toContain('{"ip":"1.2.3.4"}');
  });

  it("list({ entity, entityId }) builds a parameterized WHERE clause", async () => {
    const activity = buildActivity(pool);
    await activity.list({ entity: "user", entityId: "u1", limit: 10 });
    const [call] = pool.calls;
    expect(call!.sql).toContain('FROM "activity"');
    expect(call!.sql).toMatch(/WHERE "entity" = \$1 AND "entityId" = \$2/);
    expect(call!.values).toEqual(["user", "u1"]);
    expect(call!.sql).toContain("LIMIT 10");
    expect(call!.sql).toMatch(/ORDER BY "createdAt" DESC/);
  });

  it("paginate() requests one extra row to detect hasMore", async () => {
    const activity = buildActivity(pool);
    await activity.paginate({ entity: "user", limit: 5 });
    const [call] = pool.calls;
    expect(call!.sql).toContain("LIMIT 6"); // limit + 1
  });

  it("count() emits SELECT COUNT(*)::int", async () => {
    pool = fakePool((sql) => (sql.startsWith("SELECT COUNT") ? [{ count: 7 }] : []));
    const activity = buildActivity(pool);
    const n = await activity.count({ entity: "user" });
    expect(n).toBe(7);
    expect(pool.calls[0]!.sql).toMatch(/SELECT COUNT\(\*\)::int AS count FROM "activity" WHERE "entity" = \$1/);
  });

  it("between() emits gte/lt date predicates", async () => {
    const activity = buildActivity(pool);
    await activity.between({
      from: new Date("2024-01-01"),
      to: new Date("2024-02-01"),
    });
    const [call] = pool.calls;
    expect(call!.sql).toMatch(/"createdAt" >= \$1 AND "createdAt" < \$2/);
  });

  it("byActor() filters by actorId", async () => {
    const activity = buildActivity(pool);
    await activity.byActor({ actorId: "admin" });
    const [call] = pool.calls;
    expect(call!.sql).toMatch(/WHERE "actorId" = \$1/);
    expect(call!.values).toEqual(["admin"]);
  });

  it("createSchema() generates the expected DDL", async () => {
    const ddl = generatePostgresSQL(getActivityTable());
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "activity"');
    expect(ddl).toContain('"id" TEXT PRIMARY KEY');
    expect(ddl).toContain('"metadata" JSONB');
    expect(ddl).toContain('"createdAt" TIMESTAMPTZ NOT NULL');
    expect(ddl).toMatch(/CREATE INDEX IF NOT EXISTS "activity_entity_entity_id_idx"/);
  });
});

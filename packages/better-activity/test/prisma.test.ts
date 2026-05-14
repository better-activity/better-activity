import { describe, expect, it, vi } from "vitest";
import { prismaAdapter, type PrismaDelegate } from "../src/adapters/prisma";
import { betterActivity } from "../src/better-activity";

interface FakeRecorder {
  creates: Record<string, unknown>[];
  findFirsts: Record<string, unknown>[];
  findManys: Record<string, unknown>[];
  updates: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  updateManys: { where: Record<string, unknown>; data: Record<string, unknown> }[];
  deletes: Record<string, unknown>[];
  deleteManys: Record<string, unknown>[];
  counts: Record<string, unknown>[];
}

function fakeDelegate(opts: {
  rows?: Record<string, unknown>[];
  withCreateMany?: boolean;
  count?: number;
} = {}): { delegate: PrismaDelegate; recorder: FakeRecorder } {
  const recorder: FakeRecorder = {
    creates: [],
    findFirsts: [],
    findManys: [],
    updates: [],
    updateManys: [],
    deletes: [],
    deleteManys: [],
    counts: [],
  };
  const { rows = [], withCreateMany = true, count = rows.length } = opts;
  const delegate: PrismaDelegate = {
    create: vi.fn(async ({ data }) => {
      recorder.creates.push(data);
      return data;
    }),
    findFirst: vi.fn(async ({ where }) => {
      recorder.findFirsts.push((where ?? {}) as Record<string, unknown>);
      return rows[0] ?? null;
    }),
    findMany: vi.fn(async (args) => {
      recorder.findManys.push((args.where ?? {}) as Record<string, unknown>);
      return rows;
    }),
    count: vi.fn(async ({ where }) => {
      recorder.counts.push((where ?? {}) as Record<string, unknown>);
      return count;
    }),
    update: vi.fn(async ({ where, data }) => {
      recorder.updates.push({ where, data });
      return { ...rows[0], ...data };
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      recorder.updateManys.push({ where, data });
      return { count };
    }),
    delete: vi.fn(async ({ where }) => {
      recorder.deletes.push(where);
      return rows[0] ?? null;
    }),
    deleteMany: vi.fn(async ({ where }) => {
      recorder.deleteManys.push(where);
      return { count };
    }),
  };
  if (withCreateMany) {
    delegate.createManyAndReturn = vi.fn(async ({ data }) => {
      recorder.creates.push(...data);
      return data;
    });
  }
  return { delegate, recorder };
}

const buildActivity = (delegate: PrismaDelegate) =>
  betterActivity({
    database: prismaAdapter({ delegate }),
    entities: { user: { actions: ["created", "logged_in"] } },
  });

describe("prismaAdapter", () => {
  it("save() calls delegate.create with the assembled row", async () => {
    const { delegate, recorder } = fakeDelegate();
    const a = buildActivity(delegate);
    await a.save({ entity: "user", entityId: "u1", action: "logged_in" });
    expect(recorder.creates).toHaveLength(1);
    expect(recorder.creates[0]!.entity).toBe("user");
  });

  it("saveMany() prefers createManyAndReturn when available", async () => {
    const { delegate, recorder } = fakeDelegate({ withCreateMany: true });
    const a = buildActivity(delegate);
    await a.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    expect(delegate.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(recorder.creates).toHaveLength(2);
  });

  it("saveMany() falls back to sequential create calls", async () => {
    const { delegate, recorder } = fakeDelegate({ withCreateMany: false });
    const a = buildActivity(delegate);
    await a.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    expect(delegate.create).toHaveBeenCalledTimes(2);
    expect(recorder.creates).toHaveLength(2);
  });

  it("saveMany([]) is a no-op", async () => {
    const { delegate } = fakeDelegate();
    const a = buildActivity(delegate);
    expect(await a.saveMany([])).toEqual([]);
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("findOne returns null when no row matches", async () => {
    const { delegate } = fakeDelegate({ rows: [] });
    const adapter = prismaAdapter({ delegate })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    expect(
      await adapter.findOne({
        model: "activity",
        where: [{ field: "id", value: "x" }],
      }),
    ).toBeNull();
  });

  it("findMany passes orderBy + take + skip + projection", async () => {
    const { delegate } = fakeDelegate({ rows: [{ id: "a" }] });
    const adapter = prismaAdapter({ delegate })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [],
      limit: 5,
      offset: 2,
      sortBy: { field: "createdAt", direction: "asc" },
      select: ["id"],
    });
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: undefined,
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 5,
      skip: 2,
    });
  });

  it("translates eq/null, ne, in, not_in, lt/lte/gt/gte, contains/starts/ends", async () => {
    const { delegate, recorder } = fakeDelegate();
    const adapter = prismaAdapter({ delegate, dialect: "postgres" })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({ model: "activity", where: [{ field: "actorId", value: null }] });
    expect(recorder.findManys[0]).toEqual({ actorId: null });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "entity", value: "user" }],
    });
    expect(recorder.findManys[1]).toEqual({ entity: { equals: "user" } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "entity", value: "user", operator: "ne" }],
    });
    expect(recorder.findManys[2]).toEqual({ entity: { not: "user" } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "lt" }],
    });
    expect(recorder.findManys[3]).toEqual({ v: { lt: 1 } });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "lte" }],
    });
    expect(recorder.findManys[4]).toEqual({ v: { lte: 1 } });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "gt" }],
    });
    expect(recorder.findManys[5]).toEqual({ v: { gt: 1 } });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "v", value: 1, operator: "gte" }],
    });
    expect(recorder.findManys[6]).toEqual({ v: { gte: 1 } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: ["a", "b"], operator: "in" }],
    });
    expect(recorder.findManys[7]).toEqual({ action: { in: ["a", "b"] } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: ["a"], operator: "not_in" }],
    });
    expect(recorder.findManys[8]).toEqual({ action: { notIn: ["a"] } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "contains" }],
    });
    expect(recorder.findManys[9]).toEqual({ action: { contains: "log" } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "starts_with" }],
    });
    expect(recorder.findManys[10]).toEqual({ action: { startsWith: "log" } });

    await adapter.findMany({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "ends_with" }],
    });
    expect(recorder.findManys[11]).toEqual({ action: { endsWith: "log" } });
  });

  it("postgres adds mode:insensitive, other dialects do not", async () => {
    const { delegate, recorder } = fakeDelegate();
    const adapter = prismaAdapter({ delegate, dialect: "postgres" })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "actorId", value: "BOB", mode: "insensitive" }],
    });
    expect(recorder.findManys[0]).toEqual({
      actorId: { equals: "BOB", mode: "insensitive" },
    });

    const { delegate: d2, recorder: r2 } = fakeDelegate();
    const adapter2 = prismaAdapter({ delegate: d2, dialect: "mysql" })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter2.findMany({
      model: "activity",
      where: [{ field: "actorId", value: "BOB", mode: "insensitive" }],
    });
    expect(r2.findManys[0]).toEqual({ actorId: { equals: "BOB" } });
  });

  it("AND clauses fold into a single doc, OR splits into OR", async () => {
    const { delegate, recorder } = fakeDelegate();
    const adapter = prismaAdapter({ delegate })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [
        { field: "entity", value: "user" },
        { field: "actorId", value: "alice" },
      ],
    });
    expect(recorder.findManys[0]).toEqual({
      AND: [{ entity: { equals: "user" } }, { actorId: { equals: "alice" } }],
    });
    await adapter.findMany({
      model: "activity",
      where: [
        { field: "actorId", value: "alice" },
        { field: "actorId", value: "bob", connector: "OR" },
      ],
    });
    expect(recorder.findManys[1]).toEqual({
      OR: [{ actorId: { equals: "alice" } }, { actorId: { equals: "bob" } }],
    });
  });

  it("update finds first then updates by id; null when missing", async () => {
    const { delegate, recorder } = fakeDelegate({ rows: [{ id: "x" }] });
    const adapter = prismaAdapter({ delegate })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(r).toEqual({ id: "x", actorId: "y" });
    expect(recorder.updates[0]!.where).toEqual({ id: "x" });

    const { delegate: d2 } = fakeDelegate({ rows: [] });
    const a2 = prismaAdapter({ delegate: d2 })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    expect(
      await a2.update({
        model: "activity",
        where: [{ field: "id", value: "x" }],
        update: { actorId: "y" },
      }),
    ).toBeNull();
  });

  it("delete only invokes delegate.delete when a row matches", async () => {
    const { delegate, recorder } = fakeDelegate({ rows: [{ id: "x" }] });
    const adapter = prismaAdapter({ delegate })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(recorder.deletes[0]).toEqual({ id: "x" });

    const { delegate: d2, recorder: r2 } = fakeDelegate({ rows: [] });
    const a2 = prismaAdapter({ delegate: d2 })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await a2.delete({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(r2.deletes).toHaveLength(0);
  });

  it("updateMany / deleteMany return counts", async () => {
    const { delegate } = fakeDelegate({ rows: [{ id: "x" }], count: 5 });
    const adapter = prismaAdapter({ delegate })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    expect(
      await adapter.updateMany({
        model: "activity",
        where: [{ field: "id", value: "x" }],
        update: { actorId: "y" },
      }),
    ).toBe(5);
    expect(
      await adapter.deleteMany({
        model: "activity",
        where: [{ field: "id", value: "x" }],
      }),
    ).toBe(5);
  });

  it("debug logs are written when enabled", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const { delegate } = fakeDelegate();
      const a = betterActivity({
        database: prismaAdapter({ delegate, debugLogs: true }),
        entities: { user: { actions: ["created"] } },
      });
      await a.save({ entity: "user", entityId: "u1", action: "created" });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

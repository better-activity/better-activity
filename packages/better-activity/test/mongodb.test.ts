import { describe, expect, it, vi } from "vitest";
import {
  mongodbAdapter,
  type MongoCollection,
  type MongoDBLike,
} from "../src/adapters/mongodb";
import { betterActivity } from "../src/better-activity";

interface FakeCursor {
  sort: ReturnType<typeof vi.fn>;
  skip: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  project: ReturnType<typeof vi.fn>;
  toArray: () => Promise<Record<string, unknown>[]>;
  capturedSort?: Record<string, 1 | -1>;
  capturedSkip?: number;
  capturedLimit?: number;
  capturedProject?: Record<string, 0 | 1>;
}

interface FakeRecorder {
  filters: Record<string, unknown>[];
  inserts: Record<string, unknown>[];
  updates: { filter: Record<string, unknown>; update: Record<string, unknown> }[];
  deletes: Record<string, unknown>[];
  cursors: FakeCursor[];
}

function fakeMongo(opts: {
  rows?: Record<string, unknown>[];
  modifiedCount?: number;
  deletedCount?: number;
} = {}): { db: MongoDBLike; recorder: FakeRecorder } {
  const recorder: FakeRecorder = {
    filters: [],
    inserts: [],
    updates: [],
    deletes: [],
    cursors: [],
  };
  const { rows = [], modifiedCount = 0, deletedCount = 0 } = opts;
  const collection: MongoCollection = {
    insertOne: vi.fn(async (doc) => {
      recorder.inserts.push(doc);
      return undefined;
    }),
    insertMany: vi.fn(async (docs) => {
      recorder.inserts.push(...docs);
      return undefined;
    }),
    findOne: vi.fn(async (filter) => {
      recorder.filters.push(filter);
      return rows[0] ?? null;
    }),
    find: vi.fn((filter: Record<string, unknown>) => {
      recorder.filters.push(filter);
      const cursor: FakeCursor = {
        sort: vi.fn((s: Record<string, 1 | -1>) => {
          cursor.capturedSort = s;
          return cursor;
        }),
        skip: vi.fn((n: number) => {
          cursor.capturedSkip = n;
          return cursor;
        }),
        limit: vi.fn((n: number) => {
          cursor.capturedLimit = n;
          return cursor;
        }),
        project: vi.fn((p: Record<string, 0 | 1>) => {
          cursor.capturedProject = p;
          return cursor;
        }),
        toArray: vi.fn(async () => rows),
      };
      recorder.cursors.push(cursor);
      return cursor;
    }),
    countDocuments: vi.fn(async (filter) => {
      recorder.filters.push(filter);
      return rows.length;
    }),
    findOneAndUpdate: vi.fn(async (filter, update) => {
      recorder.updates.push({ filter, update });
      return rows[0] ?? null;
    }),
    updateMany: vi.fn(async (filter, update) => {
      recorder.updates.push({ filter, update });
      return { modifiedCount };
    }),
    deleteOne: vi.fn(async (filter) => {
      recorder.deletes.push(filter);
      return { deletedCount };
    }),
    deleteMany: vi.fn(async (filter) => {
      recorder.deletes.push(filter);
      return { deletedCount };
    }),
  };
  return {
    db: { collection: () => collection },
    recorder,
  };
}

describe("mongodbAdapter", () => {
  it("save() inserts a document with all canonical fields", async () => {
    const { db, recorder } = fakeMongo();
    const a = betterActivity({
      database: mongodbAdapter({ db }),
      entities: { user: { actions: ["created"] } },
    });
    await a.save({
      entity: "user",
      entityId: "u1",
      action: "created",
      metadata: { ip: "1.1.1.1" } as never,
    });
    expect(recorder.inserts).toHaveLength(1);
    const doc = recorder.inserts[0]!;
    expect(doc.entity).toBe("user");
    expect(doc.metadata).toEqual({ ip: "1.1.1.1" });
  });

  it("saveMany() uses insertMany and short-circuits empty", async () => {
    const { db, recorder } = fakeMongo();
    const a = betterActivity({
      database: mongodbAdapter({ db }),
      entities: { user: { actions: ["created"] } },
    });
    expect(await a.saveMany([])).toEqual([]);
    await a.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    expect(recorder.inserts).toHaveLength(2);
  });

  it("translates eq/ne/in/not_in/lt/lte/gt/gte/contains/starts_with/ends_with", async () => {
    const { db, recorder } = fakeMongo();
    const adapter = mongodbAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findMany({
      model: "activity",
      where: [{ field: "entity", value: "user" }],
    });
    expect(recorder.filters[0]).toEqual({ entity: { $eq: "user" } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "actorId", value: null }],
    });
    expect(recorder.filters[1]).toEqual({ actorId: { $eq: null } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "actorId", value: null, operator: "ne" }],
    });
    expect(recorder.filters[2]).toEqual({ actorId: { $ne: null } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "entity", value: "user", operator: "ne" }],
    });
    expect(recorder.filters[3]).toEqual({ entity: { $ne: "user" } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "createdAt", value: 1, operator: "lt" }],
    });
    expect(recorder.filters[4]).toEqual({ createdAt: { $lt: 1 } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "createdAt", value: 1, operator: "lte" }],
    });
    expect(recorder.filters[5]).toEqual({ createdAt: { $lte: 1 } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "createdAt", value: 1, operator: "gt" }],
    });
    expect(recorder.filters[6]).toEqual({ createdAt: { $gt: 1 } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "createdAt", value: 1, operator: "gte" }],
    });
    expect(recorder.filters[7]).toEqual({ createdAt: { $gte: 1 } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: ["a", "b"], operator: "in" }],
    });
    expect(recorder.filters[8]).toEqual({ action: { $in: ["a", "b"] } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: ["a"], operator: "not_in" }],
    });
    expect(recorder.filters[9]).toEqual({ action: { $nin: ["a"] } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: "log.it", operator: "contains" }],
    });
    expect(recorder.filters[10]).toEqual({ action: { $regex: "log\\.it" } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "starts_with" }],
    });
    expect(recorder.filters[11]).toEqual({ action: { $regex: "^log" } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: "in", operator: "ends_with" }],
    });
    expect(recorder.filters[12]).toEqual({ action: { $regex: "in$" } });
  });

  it("uses regex anchors + $options for insensitive eq/contains/starts_with/ends_with", async () => {
    const { db, recorder } = fakeMongo();
    const adapter = mongodbAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findOne({
      model: "activity",
      where: [{ field: "actorId", value: "BOB", mode: "insensitive" }],
    });
    expect(recorder.filters[0]).toEqual({
      actorId: { $regex: "^BOB$", $options: "i" },
    });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "contains", mode: "insensitive" }],
    });
    expect(recorder.filters[1]).toEqual({ action: { $regex: "log", $options: "i" } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: "log", operator: "starts_with", mode: "insensitive" }],
    });
    expect(recorder.filters[2]).toEqual({ action: { $regex: "^log", $options: "i" } });

    await adapter.findOne({
      model: "activity",
      where: [{ field: "action", value: "in", operator: "ends_with", mode: "insensitive" }],
    });
    expect(recorder.filters[3]).toEqual({ action: { $regex: "in$", $options: "i" } });
  });

  it("AND clauses fold into a single doc; OR splits into $or", async () => {
    const { db, recorder } = fakeMongo();
    const adapter = mongodbAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    await adapter.findOne({
      model: "activity",
      where: [
        { field: "entity", value: "user" },
        { field: "actorId", value: "alice" },
      ],
    });
    expect(recorder.filters[0]).toEqual({
      $and: [{ entity: { $eq: "user" } }, { actorId: { $eq: "alice" } }],
    });

    await adapter.findOne({
      model: "activity",
      where: [
        { field: "actorId", value: "alice" },
        { field: "actorId", value: "bob", connector: "OR" },
      ],
    });
    expect(recorder.filters[1]).toEqual({
      $or: [{ actorId: { $eq: "alice" } }, { actorId: { $eq: "bob" } }],
    });
  });

  it("findMany passes sort, skip, limit, and projection", async () => {
    const { db, recorder } = fakeMongo({ rows: [{ id: "x" }] });
    const adapter = mongodbAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const xs = await adapter.findMany({
      model: "activity",
      where: [],
      limit: 5,
      offset: 2,
      sortBy: { field: "createdAt", direction: "desc" },
      select: ["id"],
    });
    expect(xs).toHaveLength(1);
    const cursor = recorder.cursors[0]!;
    expect(cursor.capturedSort).toEqual({ createdAt: -1 });
    expect(cursor.capturedSkip).toBe(2);
    expect(cursor.capturedLimit).toBe(5);
    expect(cursor.capturedProject).toEqual({ id: 1 });
  });

  it("update / updateMany / delete / deleteMany count rows correctly", async () => {
    const { db, recorder } = fakeMongo({
      rows: [{ id: "x" }],
      modifiedCount: 4,
      deletedCount: 7,
    });
    const adapter = mongodbAdapter({ db })({
      database: () => ({}) as never,
      tableName: "activity",
    });
    const r = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(r).toEqual({ id: "x" });
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
    expect(recorder.deletes).toHaveLength(1);
    const removed = await adapter.deleteMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
    });
    expect(removed).toBe(7);
  });

  it("count() returns the document count", async () => {
    const { db } = fakeMongo({ rows: [{ id: "a" }, { id: "b" }] });
    const a = betterActivity({
      database: mongodbAdapter({ db }),
      entities: { user: { actions: ["created"] } },
    });
    expect(await a.count()).toBe(2);
  });

  it("createSchema emits an indexes helper", async () => {
    const { db } = fakeMongo();
    const opts = { database: () => ({}) as never, tableName: "activity" };
    const adapter = mongodbAdapter({ db })(opts);
    const s = await adapter.createSchema!(opts);
    expect(s.code).toContain("ensureActivityIndexes");
    expect(s.path).toContain("mongodb-activity.ts");
  });

  it("debug logs are written when enabled", async () => {
    const { db } = fakeMongo();
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const a = betterActivity({
        database: mongodbAdapter({ db, debugLogs: true }),
        entities: { user: { actions: ["created"] } },
      });
      await a.save({ entity: "user", entityId: "u1", action: "created" });
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { createAdapterFactory } from "../src/adapter-factory";
import type { CustomAdapter } from "../src/adapter";
import type { BetterActivityOptions } from "../src/types";

function makeNoopInner(overrides: Partial<CustomAdapter> = {}): CustomAdapter {
  return {
    create: vi.fn(async ({ data }) => data) as CustomAdapter["create"],
    findOne: vi.fn(async () => null) as CustomAdapter["findOne"],
    findMany: vi.fn(async () => []) as CustomAdapter["findMany"],
    count: vi.fn(async () => 0) as CustomAdapter["count"],
    update: vi.fn(async () => null) as CustomAdapter["update"],
    updateMany: vi.fn(async () => 0) as CustomAdapter["updateMany"],
    delete: vi.fn(async () => undefined) as CustomAdapter["delete"],
    deleteMany: vi.fn(async () => 0) as CustomAdapter["deleteMany"],
    ...overrides,
  };
}

const baseOptions: BetterActivityOptions = {
  database: () => ({}) as never,
  tableName: "activity",
};

describe("createAdapterFactory", () => {
  it("uses createMany fallback when inner adapter omits it", async () => {
    const innerCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const inner = makeNoopInner({
      create: innerCreate as CustomAdapter["create"],
    });
    delete (inner as Partial<CustomAdapter>).createMany;
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const out = await adapter.createMany({
      model: "activity",
      data: [
        { entity: "user", entityId: "u1" },
        { entity: "user", entityId: "u2" },
      ],
    });
    expect(out).toHaveLength(2);
    expect(innerCreate).toHaveBeenCalledTimes(2);
  });

  it("delegates to inner.createMany when implemented", async () => {
    const innerCreateMany = vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => data);
    const inner = makeNoopInner({
      createMany: innerCreateMany as CustomAdapter["createMany"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.createMany({
      model: "activity",
      data: [{ entity: "user", entityId: "u1" }],
    });
    expect(innerCreateMany).toHaveBeenCalledTimes(1);
  });

  it("generates an id on create when none is provided", async () => {
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      create: (async ({ data }) => {
        captured.push(data);
        return data;
      }) as CustomAdapter["create"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.create({ model: "activity", data: { entity: "user" } });
    expect((captured[0]!.id as string)).toMatch(/^act_/);
  });

  it("does not overwrite a caller-supplied id", async () => {
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      create: (async ({ data }) => {
        captured.push(data);
        return data;
      }) as CustomAdapter["create"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.create({
      model: "activity",
      data: { id: "manual_1", entity: "user" },
    });
    expect(captured[0]!.id).toBe("manual_1");
  });

  it("respects forceAllowId on create / createMany", async () => {
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      create: (async ({ data }) => {
        captured.push(data);
        return data;
      }) as CustomAdapter["create"],
      createMany: (async ({ data }) => {
        captured.push(...data);
        return data;
      }) as CustomAdapter["createMany"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.create({
      model: "activity",
      data: { entity: "user" },
      forceAllowId: true,
    });
    expect(captured[0]!.id).toBeUndefined();
    await adapter.createMany({
      model: "activity",
      data: [{ entity: "u" }],
      forceAllowId: true,
    });
    expect(captured[1]!.id).toBeUndefined();
  });

  it("disableIdGeneration skips id injection on create / createMany", async () => {
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      create: (async ({ data }) => {
        captured.push(data);
        return data;
      }) as CustomAdapter["create"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test", disableIdGeneration: true },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.create({ model: "activity", data: { entity: "user" } });
    await adapter.createMany({ model: "activity", data: [{ entity: "u" }] });
    expect(captured[0]!.id).toBeUndefined();
    expect(captured[1]!.id).toBeUndefined();
  });

  it("custom generateId is used", async () => {
    let n = 0;
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      create: (async ({ data }) => {
        captured.push(data);
        return data;
      }) as CustomAdapter["create"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test", generateId: ({ model }) => `${model}_${++n}` },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.create({ model: "activity", data: { entity: "user" } });
    expect(captured[0]!.id).toBe("activity_1");
  });

  it("transforms Date / boolean / object inputs when engine lacks support", async () => {
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      create: (async ({ data }) => {
        captured.push(data);
        return data;
      }) as CustomAdapter["create"],
    });
    const factory = createAdapterFactory({
      config: {
        adapterId: "test",
        supportsDates: false,
        supportsBooleans: false,
        supportsJSON: false,
      },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const date = new Date("2024-05-10T00:00:00Z");
    await adapter.create({
      model: "activity",
      data: {
        id: "x",
        entity: "user",
        flag: true,
        flagFalse: false,
        metadata: { ip: "1.1.1.1" },
        list: ["a", "b"],
        nullVal: null,
        nothing: undefined,
        createdAt: date,
      },
    });
    const row = captured[0]!;
    expect(row.flag).toBe(1);
    expect(row.flagFalse).toBe(0);
    expect(row.metadata).toBe('{"ip":"1.1.1.1"}');
    expect(row.list).toBe('["a","b"]');
    expect(row.createdAt).toBe(date.toISOString());
    expect(row.nullVal).toBeNull();
    expect("nothing" in row).toBe(false);
  });

  it("rebuilds Date / boolean / object outputs from stringified values", async () => {
    const stored = {
      id: "x",
      entity: "user",
      entityId: "u1",
      action: "created",
      actorId: null,
      actorType: null,
      metadata: '{"ip":"1.1.1.1"}',
      ip: null,
      userAgent: null,
      requestId: null,
      createdAt: "2024-05-10T00:00:00.000Z",
    };
    const inner = makeNoopInner({
      findOne: (async () => stored) as CustomAdapter["findOne"],
      findMany: (async () => [stored]) as CustomAdapter["findMany"],
    });
    const factory = createAdapterFactory({
      config: {
        adapterId: "test",
        supportsDates: false,
        supportsBooleans: false,
        supportsJSON: false,
      },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const row = (await adapter.findOne({ model: "activity", where: [] })) as Record<
      string,
      unknown
    > | null;
    expect(row?.metadata).toEqual({ ip: "1.1.1.1" });
    expect(row?.createdAt).toBeInstanceOf(Date);
    const xs = (await adapter.findMany({ model: "activity" })) as Record<string, unknown>[];
    expect(xs[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("output transformer leaves unparseable JSON / invalid date strings alone", async () => {
    const stored = {
      id: "x",
      metadata: "not-json",
      createdAt: "not-a-date",
    };
    const inner = makeNoopInner({
      findOne: (async () => stored) as CustomAdapter["findOne"],
    });
    const factory = createAdapterFactory({
      config: {
        adapterId: "test",
        supportsDates: false,
        supportsBooleans: false,
        supportsJSON: false,
      },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const row = (await adapter.findOne({ model: "activity", where: [] })) as Record<
      string,
      unknown
    > | null;
    expect(row?.metadata).toBe("not-json");
    expect(row?.createdAt).toBe("not-a-date");
  });

  it("findOne returns null when inner returns null", async () => {
    const inner = makeNoopInner();
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const r = await adapter.findOne({ model: "activity", where: [] });
    expect(r).toBeNull();
  });

  it("update returns null when no row was matched", async () => {
    const inner = makeNoopInner();
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const r = await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { actorId: "y" },
    });
    expect(r).toBeNull();
  });

  it("debugLog triggers when adapter or user options enable debugLogs", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const inner = makeNoopInner();
      const factory = createAdapterFactory({
        config: { adapterId: "test", adapterName: "TestAdapter", debugLogs: true },
        adapter: ({ debugLog }) => {
          debugLog("hello", 1, 2);
          return inner;
        },
      });
      factory(baseOptions);
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });

  it("debugLog uses adapterId when adapterName is missing", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const inner = makeNoopInner();
      const factory = createAdapterFactory({
        config: { adapterId: "myid" },
        adapter: ({ debugLog }) => {
          debugLog("hello");
          return inner;
        },
      });
      factory({ ...baseOptions, debugLogs: true });
      const calledWith = debugSpy.mock.calls[0]!.join(" ");
      expect(calledWith).toContain("myid");
    } finally {
      debugSpy.mockRestore();
    }
  });

  it("createSchema delegates to inner.createSchema when present", async () => {
    const inner = makeNoopInner();
    const innerSchema = vi.fn(async () => ({
      code: "-- inner",
      path: "/tmp/inner.sql",
    }));
    inner.createSchema = innerSchema as never;
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const s = await adapter.createSchema!(baseOptions, "/tmp/out.sql");
    expect(innerSchema).toHaveBeenCalledWith({ file: "/tmp/out.sql", table: expect.anything() });
    expect(s.code).toBe("-- inner");
  });

  it("createSchema falls back to Postgres SQL when adapterId mentions postgres", async () => {
    const inner = makeNoopInner();
    const factory = createAdapterFactory({
      config: { adapterId: "postgres" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const s = await adapter.createSchema!(baseOptions);
    expect(s.code).toContain("TIMESTAMPTZ");
    expect(s.path).toContain("postgres-activity.sql");
  });

  it("createSchema falls back to MySQL SQL when adapterId mentions mysql", async () => {
    const inner = makeNoopInner();
    const factory = createAdapterFactory({
      config: { adapterId: "mysql" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const s = await adapter.createSchema!(baseOptions);
    expect(s.code).toContain("DATETIME(3)");
  });

  it("createSchema falls back to SQLite for any other adapterId", async () => {
    const inner = makeNoopInner();
    const factory = createAdapterFactory({
      config: { adapterId: "memory" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    const s = await adapter.createSchema!(baseOptions, "/tmp/x.sql");
    expect(s.code).toContain("TEXT");
    expect(s.path).toBe("/tmp/x.sql");
  });

  it("update transforms JSON values when supportsJSON is false", async () => {
    const captured: Record<string, unknown>[] = [];
    const inner = makeNoopInner({
      update: (async ({ update }) => {
        captured.push(update);
        return update;
      }) as CustomAdapter["update"],
      updateMany: (async ({ update }) => {
        captured.push(update);
        return 1;
      }) as CustomAdapter["updateMany"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test", supportsJSON: false },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    await adapter.update({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { metadata: { ip: "1.1.1.1" } },
    });
    expect(captured[0]!.metadata).toBe('{"ip":"1.1.1.1"}');
    await adapter.updateMany({
      model: "activity",
      where: [{ field: "id", value: "x" }],
      update: { metadata: { ip: "2.2.2.2" } },
    });
    expect(captured[1]!.metadata).toBe('{"ip":"2.2.2.2"}');
  });

  it("count and delete pass through to inner with cleaned where", async () => {
    const cnt = vi.fn(async () => 7);
    const del = vi.fn(async () => undefined);
    const delMany = vi.fn(async () => 3);
    const inner = makeNoopInner({
      count: cnt as CustomAdapter["count"],
      delete: del as CustomAdapter["delete"],
      deleteMany: delMany as CustomAdapter["deleteMany"],
    });
    const factory = createAdapterFactory({
      config: { adapterId: "test" },
      adapter: () => inner,
    });
    const adapter = factory(baseOptions);
    expect(await adapter.count({ model: "activity" })).toBe(7);
    await adapter.delete({ model: "activity", where: [{ field: "id", value: "x" }] });
    expect(del).toHaveBeenCalled();
    expect(
      await adapter.deleteMany({
        model: "activity",
        where: [{ field: "id", value: "x" }],
      }),
    ).toBe(3);
  });
});

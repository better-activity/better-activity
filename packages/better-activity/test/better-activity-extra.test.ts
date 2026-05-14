import { describe, expect, it, vi } from "vitest";
import { betterActivity } from "../src/better-activity";
import { memoryAdapter } from "../src/adapters/memory";
import { HookAbortedError } from "../src/errors";

const makeActivity = () =>
  betterActivity({
    database: memoryAdapter({}),
    entities: {
      user: { actions: ["created", "deleted"] },
    },
  });

describe("betterActivity — extra coverage", () => {
  it("saveMany() with empty input returns []", async () => {
    const a = makeActivity();
    const out = await a.saveMany([]);
    expect(out).toEqual([]);
  });

  it("saveMany() in disabled mode returns synthesized records without persisting", async () => {
    const store = {};
    const a = betterActivity({
      database: memoryAdapter(store),
      entities: { user: { actions: ["created"] } },
      disabled: true,
    });
    const out = await a.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
    ]);
    expect(out).toHaveLength(2);
    expect((out as { id: string }[]).every((r) => r.id.startsWith("act_"))).toBe(true);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it("save() runs all afterSave hooks and notifies subscribers", async () => {
    const after1 = vi.fn();
    const after2 = vi.fn();
    const a = betterActivity({
      database: memoryAdapter({}),
      entities: { user: { actions: ["created"] } },
      afterSave: [after1, after2],
    });
    const seen = vi.fn();
    a.subscribe(seen);
    await a.save({ entity: "user", entityId: "u1", action: "created" });
    expect(after1).toHaveBeenCalledTimes(1);
    expect(after2).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("save() swallows subscriber errors and logs when debugLogs is on", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const a = betterActivity({
        database: memoryAdapter({}),
        entities: { user: { actions: ["created"] } },
        debugLogs: true,
      });
      a.subscribe(() => {
        throw new Error("boom");
      });
      await expect(
        a.save({ entity: "user", entityId: "u1", action: "created" }),
      ).resolves.toBeDefined();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("save() rejects when a beforeSave hook throws", async () => {
    const a = betterActivity({
      database: memoryAdapter({}),
      entities: { user: { actions: ["created"] } },
      beforeSave: () => {
        throw new Error("nope");
      },
    });
    await expect(
      a.save({ entity: "user", entityId: "u1", action: "created" }),
    ).rejects.toThrow("nope");
  });

  it("save() rejects with HookAbortedError when ctx.abort is set", async () => {
    const a = makeActivity();
    a.use((ctx) => {
      ctx.abort = { reason: "no thanks" };
    });
    await expect(
      a.save({ entity: "user", entityId: "u1", action: "created" }),
    ).rejects.toBeInstanceOf(HookAbortedError);
  });

  it("use() returns an unsubscribe function", async () => {
    const a = makeActivity();
    const hook = vi.fn();
    const off = a.use(hook);
    await a.save({ entity: "user", entityId: "u1", action: "created" });
    expect(hook).toHaveBeenCalledTimes(1);
    off();
    await a.save({ entity: "user", entityId: "u1", action: "created" });
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it("use() unsubscribe is idempotent and ignores unknown hooks", () => {
    const a = makeActivity();
    const off = a.use(() => undefined);
    off();
    expect(off).not.toThrow();
    off();
  });

  it("purge() requires at least one filter", async () => {
    const a = makeActivity();
    await expect(a.purge({})).rejects.toThrow(/requires at least one filter/);
  });

  it("purge({ before }) deletes only old events", async () => {
    const a = makeActivity();
    await a.save({
      entity: "user",
      entityId: "u1",
      action: "created",
      createdAt: new Date("2020-01-01"),
    });
    await a.save({
      entity: "user",
      entityId: "u2",
      action: "created",
      createdAt: new Date("2030-01-01"),
    });
    const removed = await a.purge({ before: new Date("2025-01-01") });
    expect(removed).toBe(1);
    expect(await a.count()).toBe(1);
  });

  it("purge({ entityId }) deletes only matching entities", async () => {
    const a = makeActivity();
    await a.save({ entity: "user", entityId: "u1", action: "created" });
    await a.save({ entity: "user", entityId: "u2", action: "created" });
    const removed = await a.purge({ entityId: "u1" });
    expect(removed).toBe(1);
  });

  it("list() respects after/before filters and sortBy=asc", async () => {
    const a = makeActivity();
    const t0 = new Date("2024-01-01");
    const t1 = new Date("2024-02-01");
    const t2 = new Date("2024-03-01");
    await a.save({ entity: "user", entityId: "u1", action: "created", createdAt: t0 });
    await a.save({ entity: "user", entityId: "u1", action: "deleted", createdAt: t1 });
    await a.save({ entity: "user", entityId: "u1", action: "created", createdAt: t2 });
    const xs = await a.list({ after: t1, sortBy: "asc" });
    expect(xs).toHaveLength(2);
    expect(xs[0]!.createdAt.getTime()).toBeLessThanOrEqual(xs[1]!.createdAt.getTime());
    const ys = await a.list({ before: t2, sortBy: "asc" });
    expect(ys).toHaveLength(2);
  });

  it("count() applies actorId / action / after filters", async () => {
    const a = makeActivity();
    await a.save({
      entity: "user",
      entityId: "u1",
      action: "created",
      actorId: "admin",
      createdAt: new Date("2020-01-01"),
    });
    await a.save({
      entity: "user",
      entityId: "u2",
      action: "deleted",
      actorId: "admin",
      createdAt: new Date("2030-01-01"),
    });
    expect(await a.count({ actorId: "admin" })).toBe(2);
    expect(await a.count({ action: "deleted" })).toBe(1);
    expect(await a.count({ after: new Date("2025-01-01") })).toBe(1);
    expect(await a.count({ before: new Date("2025-01-01") })).toBe(1);
  });

  it("paginate() with no cursor and no extra rows returns nextCursor=null", async () => {
    const a = makeActivity();
    await a.save({ entity: "user", entityId: "u1", action: "created" });
    const p = await a.paginate({ limit: 10 });
    expect(p.items).toHaveLength(1);
    expect(p.hasMore).toBe(false);
    expect(p.nextCursor).toBeNull();
  });

  it("paginate() ignores invalid cursors silently", async () => {
    const a = makeActivity();
    await a.save({ entity: "user", entityId: "u1", action: "created" });
    const p = await a.paginate({ limit: 10, cursor: "not-a-cursor" });
    expect(p.items).toHaveLength(1);
  });

  it("paginate() supports filtering by all fields", async () => {
    const a = makeActivity();
    await a.save({
      entity: "user",
      entityId: "u1",
      action: "created",
      actorId: "admin",
    });
    const p = await a.paginate({
      entity: "user",
      entityId: "u1",
      action: "created",
      actorId: "admin",
      after: new Date("2000-01-01"),
      before: new Date("2100-01-01"),
    });
    expect(p.items).toHaveLength(1);
  });

  it("between() respects entity filter", async () => {
    const a = betterActivity({
      database: memoryAdapter({}),
      entities: {
        user: { actions: ["created"] },
        project: { actions: ["created"] },
      },
    });
    await a.save({
      entity: "user",
      entityId: "u1",
      action: "created",
      createdAt: new Date("2024-01-15"),
    });
    await a.save({
      entity: "project",
      entityId: "p1",
      action: "created",
      createdAt: new Date("2024-01-15"),
    });
    const xs = await a.between({
      entity: "user",
      from: new Date("2024-01-01"),
      to: new Date("2024-02-01"),
    });
    expect(xs).toHaveLength(1);
  });

  it("custom generateId is used", async () => {
    let counter = 0;
    const a = betterActivity({
      database: memoryAdapter({}),
      entities: { user: { actions: ["created"] } },
      generateId: ({ entity }) => `${entity}_${++counter}`,
    });
    const r = await a.save({ entity: "user", entityId: "u1", action: "created" });
    expect(r.id).toBe("user_1");
  });

  it("explicit id on input overrides the generator", async () => {
    const a = makeActivity();
    const r = await a.save({
      id: "act_custom",
      entity: "user",
      entityId: "u1",
      action: "created",
    });
    expect(r.id).toBe("act_custom");
  });

  it("accepts a pre-built DBAdapter directly", async () => {
    const built = memoryAdapter({})({
      database: memoryAdapter({}),
    });
    const a = betterActivity({
      database: built,
      entities: { user: { actions: ["created"] } },
    });
    const r = await a.save({ entity: "user", entityId: "u1", action: "created" });
    expect(r.id).toMatch(/^act_/);
  });

  it("non-strict mode skips entity validation entirely", async () => {
    const a = betterActivity({
      database: memoryAdapter({}),
      entities: { user: { actions: ["created"] } },
      strict: false,
    });
    await a.save({
      entity: "ghost" as never,
      entityId: "x",
      action: "vanished" as never,
    });
    expect(await a.count()).toBe(1);
  });
});

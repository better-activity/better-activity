import { describe, expect, it, vi } from "vitest";
import { betterActivity } from "../src/better-activity";
import { memoryAdapter } from "../src/adapters/memory";
import {
  HookAbortedError,
  UnknownActionError,
  UnknownEntityError,
} from "../src/errors";

const makeActivity = () => {
  const store = {};
  return {
    activity: betterActivity({
      database: memoryAdapter(store),
      entities: {
        user: { actions: ["created", "updated", "deleted", "logged_in", "logged_out"] },
        project: { actions: ["created", "archived", "restored"] },
      },
    }),
    store,
  };
};

describe("betterActivity / memory adapter", () => {
  it("save() persists and returns a fully-formed record", async () => {
    const { activity } = makeActivity();
    const r = await activity.save({
      entity: "user",
      entityId: "usr_1",
      action: "logged_in",
      actorId: "usr_1",
      metadata: { ip: "1.2.3.4" },
    });
    expect(r.id).toMatch(/^act_/);
    expect(r.entity).toBe("user");
    expect(r.action).toBe("logged_in");
    expect(r.actorId).toBe("usr_1");
    expect(r.createdAt).toBeInstanceOf(Date);
  });

  it("rejects unknown entities in strict mode", async () => {
    const { activity } = makeActivity();
    await expect(
      // @ts-expect-error – "ghost" is not in entities config.
      activity.save({ entity: "ghost", entityId: "x", action: "created" }),
    ).rejects.toBeInstanceOf(UnknownEntityError);
  });

  it("rejects unknown actions for a known entity", async () => {
    const { activity } = makeActivity();
    await expect(
      // @ts-expect-error – "deleted" is not declared on project.
      activity.save({ entity: "project", entityId: "p1", action: "deleted" }),
    ).rejects.toBeInstanceOf(UnknownActionError);
  });

  it("saveMany() persists in bulk", async () => {
    const { activity } = makeActivity();
    const rs = await activity.saveMany([
      { entity: "user", entityId: "u1", action: "created" },
      { entity: "user", entityId: "u2", action: "created" },
      { entity: "project", entityId: "p1", action: "created" },
    ]);
    expect(rs).toHaveLength(3);
    expect(await activity.count()).toBe(3);
  });

  it("list() filters by entity / entityId / action", async () => {
    const { activity } = makeActivity();
    await activity.save({ entity: "user", entityId: "u1", action: "created" });
    await activity.save({ entity: "user", entityId: "u2", action: "created" });
    await activity.save({ entity: "user", entityId: "u1", action: "logged_in" });

    expect(await activity.list({ entity: "user" })).toHaveLength(3);
    expect(await activity.list({ entity: "user", entityId: "u1" })).toHaveLength(2);
    expect(await activity.list({ entity: "user", action: "logged_in" })).toHaveLength(1);
  });

  it("byActor() returns events authored by a single actor", async () => {
    const { activity } = makeActivity();
    await activity.save({ entity: "user", entityId: "u1", action: "created", actorId: "admin" });
    await activity.save({ entity: "user", entityId: "u2", action: "created", actorId: "admin" });
    await activity.save({ entity: "user", entityId: "u3", action: "created", actorId: "system" });
    expect(await activity.byActor({ actorId: "admin" })).toHaveLength(2);
  });

  it("between() returns events in a time range", async () => {
    const { activity } = makeActivity();
    const t0 = new Date("2024-01-01T00:00:00Z");
    const t1 = new Date("2024-01-02T00:00:00Z");
    const t2 = new Date("2024-01-03T00:00:00Z");
    await activity.save({ entity: "user", entityId: "u1", action: "created", createdAt: t0 });
    await activity.save({ entity: "user", entityId: "u1", action: "logged_in", createdAt: t1 });
    await activity.save({ entity: "user", entityId: "u1", action: "logged_out", createdAt: t2 });
    const xs = await activity.between({ from: t0, to: t2 });
    expect(xs).toHaveLength(2);
  });

  it("paginate() returns stable cursor pages", async () => {
    const { activity } = makeActivity();
    for (let i = 0; i < 25; i++) {
      await activity.save({
        entity: "user",
        entityId: `u${i}`,
        action: "created",
        createdAt: new Date(2_024_000_000_000 + i * 1000),
      });
    }
    const p1 = await activity.paginate({ entity: "user", limit: 10 });
    expect(p1.items).toHaveLength(10);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).toBeTruthy();

    const p2 = await activity.paginate({
      entity: "user",
      limit: 10,
      cursor: p1.nextCursor!,
    });
    expect(p2.items).toHaveLength(10);
    // No overlap between pages.
    const ids1 = new Set(p1.items.map((x) => x.id));
    for (const item of p2.items) expect(ids1.has(item.id)).toBe(false);
  });

  it("beforeSave hooks can abort a save", async () => {
    const { activity } = makeActivity();
    activity.use((ctx) => {
      if (ctx.input.entity === "user" && ctx.input.action === "deleted") {
        ctx.abort = { reason: "deletion disabled" };
      }
    });
    await expect(
      activity.save({ entity: "user", entityId: "u1", action: "deleted" }),
    ).rejects.toBeInstanceOf(HookAbortedError);
    expect(await activity.count()).toBe(0);
  });

  it("subscribe() fans out events", async () => {
    const { activity } = makeActivity();
    const seen = vi.fn();
    const unsub = activity.subscribe(seen);
    await activity.save({ entity: "user", entityId: "u1", action: "created" });
    expect(seen).toHaveBeenCalledTimes(1);
    unsub();
    await activity.save({ entity: "user", entityId: "u1", action: "updated" });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("redact replaces configured paths before persistence", async () => {
    const store = {};
    const activity = betterActivity({
      database: memoryAdapter(store),
      entities: { user: { actions: ["logged_in"] } },
      redact: ["metadata.password"],
    });
    await activity.save({
      entity: "user",
      entityId: "u1",
      action: "logged_in",
      metadata: { password: "hunter2", ip: "1.2.3.4" } as never,
    });
    const xs = await activity.list();
    expect((xs[0]!.metadata as Record<string, unknown>).password).toBe("[redacted]");
    expect((xs[0]!.metadata as Record<string, unknown>).ip).toBe("1.2.3.4");
  });

  it("disabled mode returns synthesized records without writing", async () => {
    const { activity, store } = makeActivity();
    activity.options.disabled = true;
    await activity.save({ entity: "user", entityId: "u1", action: "created" });
    expect(Object.keys(store)).toHaveLength(0);
  });

  it("count() / purge() work together", async () => {
    const { activity } = makeActivity();
    await activity.save({ entity: "user", entityId: "u1", action: "created" });
    await activity.save({ entity: "user", entityId: "u2", action: "created" });
    await activity.save({ entity: "project", entityId: "p1", action: "created" });
    expect(await activity.count({ entity: "user" })).toBe(2);
    const removed = await activity.purge({ entity: "user" });
    expect(removed).toBe(2);
    expect(await activity.count()).toBe(1);
  });

  it("non-strict mode allows arbitrary entities/actions", async () => {
    const activity = betterActivity({
      database: memoryAdapter({}),
      strict: false,
    });
    await activity.save({ entity: "foo", entityId: "x", action: "bar" } as never);
    expect(await activity.count()).toBe(1);
  });
});

import { Hono } from "hono";
import { activity } from "../activity";

const demo = new Hono();

// Seed some activity events for testing
demo.post("/seed", async (c) => {
  await activity.saveMany([
    {
      entity: "user",
      entityId: "user_1",
      action: "created",
      actorId: "user_1",
      metadata: { email: "alice@example.com", role: "admin" },
    },
    {
      entity: "user",
      entityId: "user_1",
      action: "logged_in",
      actorId: "user_1",
      ip: "1.2.3.4",
    },
    {
      entity: "post",
      entityId: "post_1",
      action: "created",
      actorId: "user_1",
      metadata: { title: "Hello World", tags: ["intro"] },
    },
    {
      entity: "post",
      entityId: "post_1",
      action: "published",
      actorId: "user_1",
      metadata: { title: "Hello World", tags: ["intro"] },
    },
    {
      entity: "user",
      entityId: "user_2",
      action: "created",
      actorId: "user_1",
      metadata: { email: "bob@example.com", role: "member" },
    },
  ]);
  return c.json({ seeded: 5 });
});

// List all activity (optionally filter by entity/entityId/action)
demo.get("/activity", async (c) => {
  const { entity, entityId, action, actorId, limit } = c.req.query();
  const rows = await activity.list({
    entity: entity as never,
    entityId,
    action: action as never,
    actorId,
    limit: limit ? Number(limit) : 50,
  });
  return c.json(rows);
});

// Get activity for a specific user entity
demo.get("/activity/user/:id", async (c) => {
  const rows = await activity.list({
    entity: "user",
    entityId: c.req.param("id"),
  });
  return c.json(rows);
});

// Get activity for a specific post entity
demo.get("/activity/post/:id", async (c) => {
  const rows = await activity.list({
    entity: "post",
    entityId: c.req.param("id"),
  });
  return c.json(rows);
});

// Get all activity by an actor
demo.get("/activity/actor/:actorId", async (c) => {
  const rows = await activity.byActor({ actorId: c.req.param("actorId") });
  return c.json(rows);
});

// Count activity events
demo.get("/activity/count", async (c) => {
  const { entity, action } = c.req.query();
  const n = await activity.count({
    entity: entity as never,
    action: action as never,
  });
  return c.json({ count: n });
});

// Record a custom event
demo.post("/activity", async (c) => {
  const body = await c.req.json<{
    entity: "user" | "post";
    entityId: string;
    action:
      | "created"
      | "updated"
      | "deleted"
      | "logged_in"
      | "logged_out"
      | "password_changed";
    actorId?: string;
    metadata?: Record<string, unknown>;
  }>();
  const record = await activity.save({
    entity: body.entity,
    entityId: body.entityId,
    action: body.action,
    actorId: body.actorId,
    metadata: body.metadata,
  });
  return c.json(record, 201);
});

export default demo;

import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id"),
    actorType: text("actor_type"),
    metadata: jsonb("metadata"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("activity_entity_idx").on(t.entity),
    index("activity_entity_entity_id_idx").on(t.entity, t.entityId),
    index("activity_action_idx").on(t.action),
    index("activity_actor_id_idx").on(t.actorId),
    index("activity_created_at_idx").on(t.createdAt),
  ],
);

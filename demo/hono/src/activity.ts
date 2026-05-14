import { betterActivity, defineEntity } from "better-activity";
import { drizzleAdapter } from "better-activity/adapters/drizzle";
import { db } from "./db/client";
import { activity as activityTable } from "./db/schema";

export const activity = betterActivity({
  database: drizzleAdapter({
    db,
    table: activityTable,
    dialect: "postgres",
  }),
  entities: {
    user: defineEntity({
      actions: [
        "created",
        "updated",
        "deleted",
        "logged_in",
        "logged_out",
        "password_changed",
      ],
      metadata: {} as {
        email?: string;
        role?: string;
        ip?: string;
      },
    }),
    post: defineEntity({
      actions: ["created", "updated", "published", "unpublished", "deleted"],
      metadata: {} as {
        title?: string;
        tags?: string[];
      },
    }),
  },
});

/**
 * Type-level tests. Run via `vitest --typecheck`. These tests don't execute;
 * `expectTypeOf` / `// @ts-expect-error` comments do the verification.
 */

import { describe, expectTypeOf, it } from "vitest";
import { betterActivity } from "../src/better-activity";
import { memoryAdapter } from "../src/adapters/memory";
import type { ActionOf, EntityName, MetadataOf } from "../src/types";

const activity = betterActivity({
  database: memoryAdapter({}),
  entities: {
    user: {
      actions: ["created", "updated", "deleted", "logged_in", "logged_out"],
      metadata: {} as { ip?: string; userAgent?: string },
    },
    project: {
      actions: ["created", "archived", "restored", "member_added"],
      metadata: {} as { source: string; teamId: string },
    },
  },
});

type Entities = typeof activity.$Infer.Entities;

describe("type inference", () => {
  it("entity names are extracted as a literal union", () => {
    expectTypeOf<EntityName<Entities>>().toEqualTypeOf<"user" | "project">();
  });

  it("actions are constrained per entity", () => {
    expectTypeOf<ActionOf<Entities, "user">>().toEqualTypeOf<
      "created" | "updated" | "deleted" | "logged_in" | "logged_out"
    >();
    expectTypeOf<ActionOf<Entities, "project">>().toEqualTypeOf<
      "created" | "archived" | "restored" | "member_added"
    >();
  });

  it("metadata types are extracted per entity", () => {
    expectTypeOf<MetadataOf<Entities, "user">>().toEqualTypeOf<{
      ip?: string;
      userAgent?: string;
    }>();
    expectTypeOf<MetadataOf<Entities, "project">>().toEqualTypeOf<{
      source: string;
      teamId: string;
    }>();
  });

  it("save() rejects unknown entity at the type level", () => {
    // @ts-expect-error – "ghost" is not in entities
    activity.save({ entity: "ghost", entityId: "x", action: "created" });
  });

  it("save() rejects unknown action for a known entity at the type level", () => {
    // @ts-expect-error – "archived" is not a user action
    activity.save({ entity: "user", entityId: "u1", action: "archived" });
  });

  it("save() accepts known entity + action", () => {
    activity.save({ entity: "user", entityId: "u1", action: "logged_in" });
    activity.save({ entity: "project", entityId: "p1", action: "member_added" });
  });
});

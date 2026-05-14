/**
 * Type-only tests: `InferActivity` recovers a discriminated union from the
 * `BetterActivity` instance, and `defineFormatters` rejects unknown
 * entity/action combinations.
 */

import { describe, expectTypeOf, it } from "vitest";
import { betterActivity } from "better-activity";
import { memoryAdapter } from "better-activity/adapters/memory";
import { defineFormatters } from "../src/formatters";
import type {
  InferAction,
  InferActivity,
  InferEntityName,
  InferMetadata,
  InferRecord,
} from "../src/infer";

const activity = betterActivity({
  database: memoryAdapter({}),
  entities: {
    user: {
      actions: ["created", "logged_in", "logged_out"],
      metadata: {} as { ip?: string; userAgent?: string },
    },
    project: {
      actions: ["created", "archived", "restored"],
      metadata: {} as { teamId: string },
    },
  },
});

type Act = typeof activity;

describe("inference helpers", () => {
  it("extracts the entity-name union", () => {
    expectTypeOf<InferEntityName<Act>>().toEqualTypeOf<"user" | "project">();
  });

  it("extracts per-entity action unions", () => {
    expectTypeOf<InferAction<Act, "user">>().toEqualTypeOf<
      "created" | "logged_in" | "logged_out"
    >();
    expectTypeOf<InferAction<Act, "project">>().toEqualTypeOf<
      "created" | "archived" | "restored"
    >();
  });

  it("extracts per-entity metadata types", () => {
    expectTypeOf<InferMetadata<Act, "user">>().toEqualTypeOf<{
      ip?: string;
      userAgent?: string;
    }>();
    expectTypeOf<InferMetadata<Act, "project">>().toEqualTypeOf<{
      teamId: string;
    }>();
  });

  it("InferActivity is a discriminated union by entity", () => {
    type Event = InferActivity<Act>;
    // The discriminator is `entity`. Narrowing on it should reveal the
    // entity-specific `action` union.
    const e: Event = null as unknown as Event;
    if (e.entity === "user") {
      expectTypeOf(e.action).toEqualTypeOf<
        "created" | "logged_in" | "logged_out"
      >();
    } else {
      expectTypeOf(e.action).toEqualTypeOf<
        "created" | "archived" | "restored"
      >();
    }
  });

  it("InferRecord widens action across entities", () => {
    type Wide = InferRecord<Act>;
    const r: Wide = null as unknown as Wide;
    expectTypeOf(r.action).toEqualTypeOf<
      "created" | "logged_in" | "logged_out" | "archived" | "restored"
    >();
  });

  it("defineFormatters enforces known entity + action keys", () => {
    defineFormatters<Act>({
      user: {
        logged_in: () => ({ title: "ok" }),
        // @ts-expect-error – 'archived' is a project action, not a user action.
        archived: () => ({ title: "no" }),
      },
      project: {
        archived: () => ({ title: "yes" }),
      },
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultFormatters,
  defineFormatters,
  formatRelativeTime,
  groupActivity,
  resolveFormatter,
} from "../src/formatters";
import { makeRecord } from "./test-utils";

describe("formatters", () => {
  it("defaultFormatters produces a generic title for any record", () => {
    const r = makeRecord({ entity: "user", action: "logged_in", actorId: "u1", entityId: "u1" });
    const ctx = resolveFormatter(r, defaultFormatters);
    expect(ctx.title).toMatch(/u1.*logged in.*user:u1/);
    expect(ctx.description).toBe("logged in");
    expect(ctx.actor).toBe("u1");
  });

  it("entity-specific formatter wins over default", () => {
    const formatters = defineFormatters({
      user: {
        logged_in: (r) => ({ title: `signin:${(r as { actorId: string }).actorId}` }),
      },
    });
    const r = makeRecord({ entity: "user", action: "logged_in", actorId: "alice" });
    const ctx = resolveFormatter(r, formatters);
    expect(ctx.title).toBe("signin:alice");
    // Fields not produced by the entity formatter fall through.
    expect(ctx.description).toBe("logged in");
  });

  it("formatRelativeTime returns a human string", () => {
    const now = new Date("2024-06-01T12:00:00Z");
    expect(formatRelativeTime(new Date("2024-06-01T11:55:00Z"), now)).toMatch(/min/);
    expect(formatRelativeTime(new Date("2024-06-01T12:00:00Z"), now)).toBe("just now");
    expect(formatRelativeTime(new Date("2023-06-01T00:00:00Z"), now)).toMatch(/year/);
  });

  it("groupActivity buckets by day", () => {
    const records = [
      makeRecord({ createdAt: new Date("2024-01-01T01:00:00Z") }),
      makeRecord({ createdAt: new Date("2024-01-01T03:00:00Z") }),
      makeRecord({ createdAt: new Date("2024-01-02T01:00:00Z") }),
    ];
    const groups = groupActivity(records, "day");
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe("2024-01-01");
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("groupActivity buckets by entity and actor", () => {
    const records = [
      makeRecord({ entity: "user", actorId: "a" }),
      makeRecord({ entity: "project", actorId: "a" }),
      makeRecord({ entity: "user", actorId: "b" }),
    ];
    expect(groupActivity(records, "entity")).toHaveLength(2);
    expect(groupActivity(records, "actor")).toHaveLength(2);
  });
});

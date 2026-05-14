import { describe, expect, it } from "vitest";
import { activityQueryKey, matchesQuery, normalizeQuery } from "../src/query-key";

describe("query-key", () => {
  it("normalizes equivalent queries to the same key", () => {
    const a = activityQueryKey({ entity: "user", actions: ["a", "b"] });
    const b = activityQueryKey({ actions: ["b", "a"], entity: "user" });
    expect(a).toBe(b);
  });

  it("drops undefined fields", () => {
    expect(activityQueryKey({ entity: "user", entityId: undefined })).toBe(
      activityQueryKey({ entity: "user" }),
    );
  });

  it("excludes cursor from the key", () => {
    expect(activityQueryKey({ entity: "user", cursor: "c1" })).toBe(
      activityQueryKey({ entity: "user", cursor: "c99" }),
    );
  });

  it("produces different keys for distinct filters", () => {
    expect(activityQueryKey({ entity: "user" })).not.toBe(
      activityQueryKey({ entity: "project" }),
    );
    expect(activityQueryKey({ entity: "user", entityId: "u1" })).not.toBe(
      activityQueryKey({ entity: "user", entityId: "u2" }),
    );
  });

  it("normalizeQuery sorts the actions array", () => {
    const n = normalizeQuery({ actions: ["b", "a", "c"] });
    expect(n.actions).toEqual(["a", "b", "c"]);
  });

  describe("matchesQuery", () => {
    const r = {
      id: "x",
      entity: "user",
      entityId: "u1",
      action: "logged_in",
      actorId: "u1",
      createdAt: new Date("2024-06-01"),
    };
    it("matches everything when query is empty", () => {
      expect(matchesQuery({}, r)).toBe(true);
    });
    it("filters by entity / entityId / actorId", () => {
      expect(matchesQuery({ entity: "user" }, r)).toBe(true);
      expect(matchesQuery({ entity: "project" }, r)).toBe(false);
      expect(matchesQuery({ entityId: "u1" }, r)).toBe(true);
      expect(matchesQuery({ entityId: "u2" }, r)).toBe(false);
      expect(matchesQuery({ actorId: "u1" }, r)).toBe(true);
    });
    it("filters by action set", () => {
      expect(matchesQuery({ actions: ["logged_in"] }, r)).toBe(true);
      expect(matchesQuery({ actions: ["created"] }, r)).toBe(false);
    });
    it("filters by date window", () => {
      expect(matchesQuery({ after: "2024-05-01" }, r)).toBe(true);
      expect(matchesQuery({ after: "2024-07-01" }, r)).toBe(false);
      expect(matchesQuery({ before: "2024-07-01" }, r)).toBe(true);
      expect(matchesQuery({ before: "2024-05-01" }, r)).toBe(false);
    });
  });
});

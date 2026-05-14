/**
 * Smoke test for the public re-exports. The values themselves are tested in
 * dedicated suites; here we just assert that the surface compiles and that
 * each named export resolves to something truthy.
 */

import { describe, expect, it } from "vitest";
import * as pkgRoot from "../index";
import * as src from "../src/index";
import {
  betterActivity,
  defineEntity,
  whereOperators,
  createAdapterFactory,
  generateActivityId,
  encodeCursor,
  decodeCursor,
  applyRedaction,
  REDACTED_VALUE,
  BetterActivityError,
  HookAbortedError,
  UnknownActionError,
  UnknownEntityError,
  generateMySQLSQL,
  generatePostgresSQL,
  generateSQLiteSQL,
  generateSchemaSQL,
  getActivityTable,
} from "../src/index";

describe("public exports", () => {
  it("root index re-exports the same surface", () => {
    expect(pkgRoot.betterActivity).toBe(src.betterActivity);
    expect(pkgRoot.whereOperators).toBe(src.whereOperators);
  });

  it("named exports are present", () => {
    expect(typeof betterActivity).toBe("function");
    expect(typeof defineEntity).toBe("function");
    expect(Array.isArray(whereOperators)).toBe(true);
    expect(typeof createAdapterFactory).toBe("function");
    expect(typeof generateActivityId).toBe("function");
    expect(typeof encodeCursor).toBe("function");
    expect(typeof decodeCursor).toBe("function");
    expect(typeof applyRedaction).toBe("function");
    expect(REDACTED_VALUE).toBe("[redacted]");
    expect(typeof BetterActivityError).toBe("function");
    expect(typeof HookAbortedError).toBe("function");
    expect(typeof UnknownActionError).toBe("function");
    expect(typeof UnknownEntityError).toBe("function");
    expect(typeof generateMySQLSQL).toBe("function");
    expect(typeof generatePostgresSQL).toBe("function");
    expect(typeof generateSQLiteSQL).toBe("function");
    expect(typeof generateSchemaSQL).toBe("function");
    expect(typeof getActivityTable).toBe("function");
  });

  it("whereOperators contains every known operator", () => {
    expect(whereOperators).toEqual(
      expect.arrayContaining([
        "eq",
        "ne",
        "lt",
        "lte",
        "gt",
        "gte",
        "in",
        "not_in",
        "contains",
        "starts_with",
        "ends_with",
      ]),
    );
  });

  it("error classes preserve the original message + code", () => {
    const e = new UnknownActionError("user", "vanished", ["created"]);
    expect(e.message).toContain("vanished");
    expect(e.code).toBe("UNKNOWN_ACTION");
    const u = new UnknownEntityError("ghost");
    expect(u.code).toBe("UNKNOWN_ENTITY");
    const a = new HookAbortedError("nope");
    expect(a.code).toBe("HOOK_ABORTED");
    const generic = new BetterActivityError("boom");
    expect(generic.code).toBe("BETTER_ACTIVITY_ERROR");
  });
});

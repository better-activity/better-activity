import { describe, expect, it } from "vitest";
import { applyRedaction, REDACTED_VALUE } from "../src/redact";

describe("applyRedaction", () => {
  it("returns input unchanged when no paths are configured", () => {
    const input = { a: 1, b: 2 };
    expect(applyRedaction(input, undefined)).toBe(input);
    expect(applyRedaction(input, [])).toBe(input);
  });

  it("redacts top-level fields", () => {
    const input = { token: "secret", name: "alice" };
    const out = applyRedaction(input, ["token"]);
    expect(out.token).toBe(REDACTED_VALUE);
    expect(out.name).toBe("alice");
  });

  it("redacts nested fields inside metadata", () => {
    const input = {
      metadata: { password: "hunter2", ip: "1.1.1.1" },
    };
    const out = applyRedaction(input, ["metadata.password"]);
    expect((out.metadata as Record<string, unknown>).password).toBe(
      REDACTED_VALUE,
    );
    expect((out.metadata as Record<string, unknown>).ip).toBe("1.1.1.1");
  });

  it("does not error when intermediate path is missing", () => {
    const input = { metadata: null } as Record<string, unknown>;
    const out = applyRedaction(input, ["metadata.password"]);
    expect(out).toEqual({ metadata: null });
  });

  it("ignores paths whose intermediate keys are absent", () => {
    const input = { metadata: { ip: "1.1.1.1" } } as Record<string, unknown>;
    const out = applyRedaction(input, ["metadata.deeply.nested.token"]);
    expect(out).toEqual({ metadata: { ip: "1.1.1.1" } });
  });

  it("ignores paths whose final key is absent", () => {
    const input = { metadata: { ip: "1.1.1.1" } } as Record<string, unknown>;
    const out = applyRedaction(input, ["metadata.password"]);
    expect(out).toEqual({ metadata: { ip: "1.1.1.1" } });
  });

  it("does not mutate the original input", () => {
    const input = { metadata: { password: "secret" } } as Record<
      string,
      unknown
    >;
    const before = JSON.stringify(input);
    applyRedaction(input, ["metadata.password"]);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("ignores empty path arrays", () => {
    const input = { a: 1 };
    const out = applyRedaction(input, [""]);
    expect(out).toEqual({ a: 1 });
  });
});

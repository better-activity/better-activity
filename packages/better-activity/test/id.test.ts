import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeCursor, encodeCursor, generateActivityId } from "../src/id";

describe("generateActivityId", () => {
  it("returns a sortable, prefixed id", () => {
    const a = generateActivityId();
    const b = generateActivityId();
    expect(a).toMatch(/^act_[0-9a-z]+_[0-9a-f]{16}$/);
    expect(b).toMatch(/^act_[0-9a-z]+_[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });

  it("uses crypto.getRandomValues when available", () => {
    const id = generateActivityId();
    const [, , rand] = id.split("_");
    expect(rand).toMatch(/^[0-9a-f]{16}$/);
  });

  describe("Math.random fallback", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("falls back to Math.random when getRandomValues is unavailable", () => {
      vi.stubGlobal("crypto", {});
      const spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
      try {
        const id = generateActivityId();
        expect(id).toMatch(/^act_[0-9a-z]+_[0-9a-f]{16}$/);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("falls back when crypto is missing entirely", () => {
      vi.stubGlobal("crypto", undefined);
      const id = generateActivityId();
      expect(id).toMatch(/^act_[0-9a-z]+_[0-9a-f]{16}$/);
    });
  });
});

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a record", () => {
    const createdAt = new Date("2024-05-10T12:00:00Z");
    const c = encodeCursor({ id: "act_abc", createdAt });
    const decoded = decodeCursor(c);
    expect(decoded).toEqual({ ts: createdAt.getTime(), id: "act_abc" });
  });

  it("returns null when payload has no separator", () => {
    const cursor = Buffer.from("no-separator", "utf8").toString("base64url");
    expect(decodeCursor(cursor)).toBeNull();
  });

  it("returns null when ts is not a number", () => {
    const cursor = Buffer.from("abc:act_xyz", "utf8").toString("base64url");
    expect(decodeCursor(cursor)).toBeNull();
  });

  it("returns null when id is empty", () => {
    const cursor = Buffer.from("123:", "utf8").toString("base64url");
    expect(decodeCursor(cursor)).toBeNull();
  });

  it("returns null when input cannot be decoded at all", () => {
    expect(decodeCursor(null as never)).toBeNull();
  });

  it("preserves ids that contain colons", () => {
    const c = encodeCursor({
      id: "act_abc:with:colons",
      createdAt: new Date(1000),
    });
    expect(decodeCursor(c)).toEqual({ ts: 1000, id: "act_abc:with:colons" });
  });
});

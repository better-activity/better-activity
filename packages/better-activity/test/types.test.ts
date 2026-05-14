import { describe, expect, it } from "vitest";
import { defineEntity } from "../src/types";

describe("defineEntity", () => {
  it("returns an EntityConfig with the actions array preserved", () => {
    const e = defineEntity({
      actions: ["created", "updated"],
      description: "User entity",
    });
    expect(e.actions).toEqual(["created", "updated"]);
    expect(e.description).toBe("User entity");
  });

  it("does not retain the metadata value at runtime (type-only brand)", () => {
    const e = defineEntity({
      actions: ["x"],
      metadata: { ip: "1.2.3.4" },
    });
    expect("metadata" in e).toBe(false);
  });

  it("works without a description", () => {
    const e = defineEntity({ actions: ["a", "b"] });
    expect(e.actions).toEqual(["a", "b"]);
    expect(e.description).toBeUndefined();
  });
});

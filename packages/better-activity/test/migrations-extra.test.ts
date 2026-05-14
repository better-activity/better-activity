import { describe, expect, it } from "vitest";
import { generateSchemaSQL } from "../src/migrations";
import type { ActivityTableSchema } from "../src/schema";

describe("generateSchemaSQL — extra branches", () => {
  it("emits NOT NULL only for non-primary required fields", () => {
    const schema: ActivityTableSchema = {
      name: "t",
      fields: [
        { name: "id", type: "string", required: true, primary: true },
        { name: "v", type: "string", required: true },
      ],
      indexes: [],
    };
    const sql = generateSchemaSQL(schema, { dialect: "postgres" });
    expect(sql).toMatch(/"id" TEXT PRIMARY KEY,/);
    expect(sql).not.toMatch(/"id" TEXT PRIMARY KEY NOT NULL/);
    expect(sql).toMatch(/"v" TEXT NOT NULL/);
  });

  it("emits UNIQUE for non-primary unique fields", () => {
    const schema: ActivityTableSchema = {
      name: "t",
      fields: [
        { name: "id", type: "string", primary: true },
        { name: "slug", type: "string", unique: true },
      ],
      indexes: [],
    };
    const sql = generateSchemaSQL(schema, { dialect: "postgres" });
    expect(sql).toMatch(/"slug" TEXT UNIQUE/);
  });

  it("respects ifNotExists: false", () => {
    const schema: ActivityTableSchema = {
      name: "t",
      fields: [
        { name: "id", type: "string", primary: true, indexed: true },
      ],
      indexes: [{ name: "t_combo_idx", fields: ["id"] }],
    };
    const sql = generateSchemaSQL(schema, { dialect: "postgres", ifNotExists: false });
    expect(sql).toMatch(/^CREATE TABLE "t"/);
    expect(sql).not.toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(sql).toMatch(/CREATE INDEX "t_id_idx"/);
    expect(sql).toMatch(/CREATE INDEX "t_combo_idx"/);
  });

  it("emits composite indexes from indexGroup metadata", () => {
    const schema: ActivityTableSchema = {
      name: "t",
      fields: [
        { name: "id", type: "string", primary: true },
        { name: "a", type: "string", indexGroup: "g" },
        { name: "b", type: "string", indexGroup: "g" },
      ],
      indexes: [{ name: "t_g_idx", fields: ["a", "b"] }],
    };
    const sql = generateSchemaSQL(schema, { dialect: "mysql" });
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS `t_g_idx` ON `t` \(`a`, `b`\)/);
  });

  it("supports every FieldType across each dialect", () => {
    const schema: ActivityTableSchema = {
      name: "t",
      fields: [
        { name: "id", type: "string", primary: true },
        { name: "txt", type: "text" },
        { name: "n", type: "number" },
        { name: "b", type: "boolean" },
        { name: "d", type: "date" },
        { name: "j", type: "json" },
      ],
      indexes: [],
    };
    const pg = generateSchemaSQL(schema, { dialect: "postgres" });
    const my = generateSchemaSQL(schema, { dialect: "mysql" });
    const sq = generateSchemaSQL(schema, { dialect: "sqlite" });
    expect(pg).toContain('"j" JSONB');
    expect(my).toContain("`j` JSON");
    expect(sq).toContain('"j" TEXT');
    expect(pg).toContain('"b" BOOLEAN');
    expect(my).toContain("`b` TINYINT(1)");
    expect(sq).toContain('"b" INTEGER');
    expect(pg).toContain('"d" TIMESTAMPTZ');
    expect(my).toContain("`d` DATETIME(3)");
    expect(sq).toContain('"d" TEXT');
  });
});

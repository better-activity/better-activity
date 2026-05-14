/**
 * Per-dialect migration generation tests.
 */

import { describe, expect, it } from "vitest";
import {
  generateMySQLSQL,
  generatePostgresSQL,
  generateSQLiteSQL,
} from "../src/migrations";
import { getActivityTable } from "../src/schema";

describe("migrations / DDL", () => {
  it("postgres emits TIMESTAMPTZ + JSONB", () => {
    const sql = generatePostgresSQL(getActivityTable());
    expect(sql).toContain('"createdAt" TIMESTAMPTZ');
    expect(sql).toContain('"metadata" JSONB');
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
  });

  it("mysql emits DATETIME(3) + JSON + backticks", () => {
    const sql = generateMySQLSQL(getActivityTable());
    expect(sql).toContain("`createdAt` DATETIME(3)");
    expect(sql).toContain("`metadata` JSON");
  });

  it("sqlite emits TEXT for json + dates", () => {
    const sql = generateSQLiteSQL(getActivityTable());
    expect(sql).toContain('"metadata" TEXT');
    expect(sql).toContain('"createdAt" TEXT');
  });

  it("custom table name is honored", () => {
    const sql = generatePostgresSQL(getActivityTable("audit_log"));
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "audit_log"');
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "audit_log_entity_idx"/);
  });
});

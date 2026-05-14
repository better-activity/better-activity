/**
 * CLI tests. We avoid touching the real filesystem outside of `os.tmpdir()`
 * and intercept `process.stdout` / `process.stderr` to assert on output.
 *
 * The CLI loads its config via `await import(path)`. To keep tests
 * hermetic and to avoid dragging the source tree into transient test
 * directories, every config we write here exports a hand-rolled minimal
 * `{ adapter, options }` object — that's all the CLI consumes.
 */

import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli/index";

let cwd: string;
let originalCwd: string;
let stdoutChunks: string[];
let stderrChunks: string[];
// `vi.spyOn(process.stdout, "write")` overload typing is fiddly; we just
// keep loose handles and restore by name.
let stdoutSpy: { mockRestore: () => void };
let stderrSpy: { mockRestore: () => void };

beforeEach(async () => {
  originalCwd = process.cwd();
  cwd = await mkdtemp(join(tmpdir(), "better-activity-cli-"));
  process.chdir(cwd);
  stdoutChunks = [];
  stderrChunks = [];
  stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: unknown) => {
      stdoutChunks.push(String(chunk));
      return true;
    }) as never);
  stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(((chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    }) as never);
  process.exitCode = undefined;
});

afterEach(async () => {
  process.chdir(originalCwd);
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.exitCode = undefined;
  await rm(cwd, { recursive: true, force: true });
});

const ESM_HEADER = `// generated test config\n`;

const buildSchemaConfig = (overrides = "") => `${ESM_HEADER}
const adapter = {
  id: "test-sql",
  options: {},
  async createSchema(_opts, file) {
    return {
      code: "CREATE TABLE x (id TEXT PRIMARY KEY);\\nCREATE INDEX i ON x (id);\\n",
      path: file ?? "./out/schema.sql",
      overwrite: false,
    };
  },
  async create() {}, async createMany() {}, async findOne() { return null; },
  async findMany() { return []; }, async count() { return 0; },
  async update() { return null; }, async updateMany() { return 0; },
  async delete() {}, async deleteMany() { return 0; },
};
${overrides}
export default { adapter, options: { tableName: "activity" } };
`;

const buildAdapterWithoutSchema = () => `${ESM_HEADER}
const adapter = {
  id: "noop",
  options: {},
  async create() {}, async createMany() {}, async findOne() { return null; },
  async findMany() { return []; }, async count() { return 0; },
  async update() { return null; }, async updateMany() { return 0; },
  async delete() {}, async deleteMany() { return 0; },
};
export default { adapter, options: { tableName: "activity" } };
`;

const buildSqlMigrationConfig = () => `${ESM_HEADER}
const calls = [];
globalThis.__cliCalls = calls;
const pool = { query: async (sql) => { calls.push(sql); } };
const adapter = {
  id: "sql-test",
  options: { pool },
  async createSchema() {
    return {
      code: "CREATE TABLE a (id TEXT);\\nCREATE INDEX i ON a (id);",
      path: "./out/m.sql",
      overwrite: false,
    };
  },
  async create() {}, async createMany() {}, async findOne() { return null; },
  async findMany() { return []; }, async count() { return 0; },
  async update() { return null; }, async updateMany() { return 0; },
  async delete() {}, async deleteMany() { return 0; },
};
export default { adapter, options: {} };
`;

describe("better-activity CLI", () => {
  it("prints help when no command is given", async () => {
    await main([]);
    expect(stdoutChunks.join("")).toContain("better-activity <command>");
  });

  it("falls through to help on unknown command", async () => {
    await main(["totally-unknown"]);
    expect(stdoutChunks.join("")).toContain("Commands:");
  });

  it("'schema' prints DDL to stdout", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildSchemaConfig(), "utf8");
    await main(["schema", "--config", cfg]);
    expect(stdoutChunks.join("")).toContain("CREATE TABLE x");
  });

  it("'generate' writes the schema file to disk and prints success", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildSchemaConfig(), "utf8");
    const out = join(cwd, "nested", "schema.sql");
    await main(["generate", "--config", cfg, "--out", out]);
    const written = await readFile(out, "utf8");
    expect(written).toContain("CREATE TABLE x");
    expect(stdoutChunks.join("")).toContain("Wrote schema");
  });

  it("'generate' refuses to overwrite without --yes", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildSchemaConfig(), "utf8");
    const out = join(cwd, "schema.sql");
    await mkdir(cwd, { recursive: true });
    await writeFile(out, "old content", "utf8");
    await main(["generate", "--config", cfg, "--out", out]);
    expect(stdoutChunks.join("")).toContain("already exists");
    expect(await readFile(out, "utf8")).toBe("old content");
    await main(["generate", "--config", cfg, "--out", out, "--yes"]);
    expect(await readFile(out, "utf8")).toContain("CREATE TABLE x");
  });

  it("'generate' uses the adapter's reported path when --out is omitted", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildSchemaConfig(), "utf8");
    await main(["generate", "--config", cfg]);
    expect(stdoutChunks.join("")).toContain("Wrote schema");
  });

  it("auto-discovers a config in the current directory", async () => {
    const cfg = join(cwd, "better-activity.config.mjs");
    await writeFile(cfg, buildSchemaConfig(), "utf8");
    await main(["schema"]);
    expect(stdoutChunks.join("")).toContain("CREATE TABLE x");
  });

  it("errors when the explicit --config file is missing", async () => {
    await main(["schema", "--config", join(cwd, "missing.mjs")]);
    expect(stderrChunks.join("")).toContain("not found");
    expect(process.exitCode).toBe(1);
  });

  it("errors when no default config exists", async () => {
    await main(["schema"]);
    expect(stderrChunks.join("")).toContain("No config found");
    expect(process.exitCode).toBe(1);
  });

  it("errors when the config has no usable export", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, `export const nothing = 1;\n`, "utf8");
    await main(["schema", "--config", cfg]);
    expect(stderrChunks.join("")).toContain("must export");
    expect(process.exitCode).toBe(1);
  });

  it("'schema' errors when adapter lacks createSchema", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildAdapterWithoutSchema(), "utf8");
    await main(["schema", "--config", cfg]);
    expect(stderrChunks.join("")).toContain("does not implement createSchema");
    expect(process.exitCode).toBe(1);
  });

  it("'generate' errors when adapter lacks createSchema", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildAdapterWithoutSchema(), "utf8");
    await main(["generate", "--config", cfg]);
    expect(stderrChunks.join("")).toContain("does not implement createSchema");
    expect(process.exitCode).toBe(1);
  });

  it("'migrate' runs SQL through the adapter's SQL pool", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildSqlMigrationConfig(), "utf8");
    await main(["migrate", "--config", cfg]);
    expect(stdoutChunks.join("")).toMatch(/Applied 2 statement/);
  });

  it("'migrate' errors when adapter has no SQL pool", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildSchemaConfig(), "utf8");
    await main(["migrate", "--config", cfg]);
    expect(stderrChunks.join("")).toMatch(/no SQL pool/);
    expect(process.exitCode).toBe(1);
  });

  it("'migrate' errors when adapter lacks createSchema", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(cfg, buildAdapterWithoutSchema(), "utf8");
    await main(["migrate", "--config", cfg]);
    expect(stderrChunks.join("")).toContain("does not implement createSchema");
    expect(process.exitCode).toBe(1);
  });

  it("accepts the 'activity' export name", async () => {
    const cfg = join(cwd, "ba.config.mjs");
    await writeFile(
      cfg,
      `${ESM_HEADER}
const adapter = {
  id: "x",
  options: {},
  async createSchema() { return { code: "SELECT 1;", path: "./out.sql" }; },
  async create() {}, async createMany() {}, async findOne() { return null; },
  async findMany() { return []; }, async count() { return 0; },
  async update() { return null; }, async updateMany() { return 0; },
  async delete() {}, async deleteMany() { return 0; },
};
export const activity = { adapter, options: {} };
`,
      "utf8",
    );
    await main(["schema", "--config", cfg]);
    expect(stdoutChunks.join("")).toContain("SELECT 1");
  });
});

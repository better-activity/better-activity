#!/usr/bin/env node
/**
 * `better-activity` CLI.
 *
 * Commands:
 *   generate [--config <path>] [--out <path>]
 *     Loads the user's config (default `./better-activity.config.{ts,js,mjs}`)
 *     and writes the migration to disk. Dispatches by `adapter.id`.
 *
 *   migrate [--config <path>]
 *     Runs the generated SQL against the configured adapter's pool (Postgres
 *     / MySQL / SQLite only — MongoDB/Drizzle/Prisma are app-managed).
 *
 *   schema [--config <path>] [--dialect postgres|mysql|sqlite]
 *     Prints the schema SQL to stdout without writing or executing.
 */

import { writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";

import type { BetterActivity } from "../types";

interface CliArgs {
  command: "generate" | "migrate" | "schema" | "help";
  config?: string;
  out?: string;
  dialect?: "postgres" | "mysql" | "sqlite";
  yes?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { command: "help" };
  const cmd = argv[0];
  if (cmd === "generate" || cmd === "migrate" || cmd === "schema") {
    out.command = cmd;
  }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.config = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--dialect") out.dialect = argv[++i] as CliArgs["dialect"];
    else if (a === "--yes" || a === "-y") out.yes = true;
  }
  return out;
}

const DEFAULT_CONFIG_PATHS = [
  "better-activity.config.ts",
  "better-activity.config.mts",
  "better-activity.config.mjs",
  "better-activity.config.js",
];

async function findConfig(explicit?: string): Promise<string> {
  if (explicit) {
    const p = isAbsolute(explicit) ? explicit : resolvePath(process.cwd(), explicit);
    if (!existsSync(p)) throw new Error(`Config file not found: ${p}`);
    return p;
  }
  for (const name of DEFAULT_CONFIG_PATHS) {
    const p = resolvePath(process.cwd(), name);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `No config found. Pass --config <path> or create one of: ${DEFAULT_CONFIG_PATHS.join(", ")}`,
  );
}

async function loadConfig(path: string): Promise<BetterActivity> {
  const mod = await import(path);
  const exported = mod.default ?? mod.activity ?? mod.betterActivity;
  if (!exported) {
    throw new Error(
      `Config at ${path} must export the BetterActivity instance as default, ` +
        `or under the name "activity" / "betterActivity".`,
    );
  }
  return exported as BetterActivity;
}

async function cmdGenerate(args: CliArgs): Promise<void> {
  const configPath = await findConfig(args.config);
  const activity = await loadConfig(configPath);
  const adapter = activity.adapter;
  if (!adapter.createSchema) {
    throw new Error(`Adapter "${adapter.id}" does not implement createSchema().`);
  }
  const result = await adapter.createSchema(activity.options, args.out);
  const target = args.out ?? result.path;
  const abs = isAbsolute(target) ? target : resolvePath(process.cwd(), target);

  if (existsSync(abs) && !result.overwrite && !args.yes) {
    process.stdout.write(`File ${abs} already exists. Re-run with --yes to overwrite.\n`);
    return;
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, result.code, "utf8");
  process.stdout.write(`✔ Wrote schema (${adapter.id}) to ${abs}\n`);
}

async function cmdSchema(args: CliArgs): Promise<void> {
  const configPath = await findConfig(args.config);
  const activity = await loadConfig(configPath);
  const adapter = activity.adapter;
  if (!adapter.createSchema) {
    throw new Error(`Adapter "${adapter.id}" does not implement createSchema().`);
  }
  const result = await adapter.createSchema(activity.options);
  process.stdout.write(result.code);
}

async function cmdMigrate(args: CliArgs): Promise<void> {
  const configPath = await findConfig(args.config);
  const activity = await loadConfig(configPath);
  const adapter = activity.adapter;
  const adapterOpts = adapter.options as Record<string, unknown> | undefined;
  if (!adapter.createSchema) {
    throw new Error(`Adapter "${adapter.id}" does not implement createSchema().`);
  }
  const result = await adapter.createSchema(activity.options);

  // We have a `pool` for the SQL adapters; use it directly.
  const pool = adapterOpts?.pool as
    | { query: (sql: string) => Promise<unknown> }
    | undefined;
  if (pool && typeof pool.query === "function") {
    // Split on `;` boundaries with a tolerant naive splitter — good enough
    // for the SQL we emit which has no embedded semicolons.
    const stmts = result.code
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of stmts) {
      await pool.query(s);
    }
    process.stdout.write(`✔ Applied ${stmts.length} statement(s) via "${adapter.id}"\n`);
    return;
  }
  throw new Error(
    `Adapter "${adapter.id}" has no SQL pool to run migrations against. ` +
      `Run "better-activity generate" and apply the SQL through your ORM tooling.`,
  );
}

function printHelp(): void {
  process.stdout.write(
    `better-activity <command> [options]

Commands:
  generate              Generate migration SQL to disk
  migrate               Apply the schema to the configured adapter
  schema                Print the schema SQL to stdout
  help                  Show this message

Options:
  --config <path>       Path to better-activity.config.{ts,js,mjs}
  --out <path>          Output file (generate)
  --yes, -y             Overwrite without prompting
`,
  );
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  try {
    switch (args.command) {
      case "generate":
        return await cmdGenerate(args);
      case "schema":
        return await cmdSchema(args);
      case "migrate":
        return await cmdMigrate(args);
      default:
        return printHelp();
    }
  } catch (err) {
    process.stderr.write(`✗ ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

// Suppress "unused" lint of `stat` import — we keep it for future "edit in
// place" support without churning the import list.
void stat;

if (require.main === module || process.argv[1]?.endsWith("cli/index.js")) {
  void main();
}

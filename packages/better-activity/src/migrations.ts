/**
 * Multi-dialect SQL DDL generator.
 *
 * Each dialect maps `FieldType` to a column type and chooses an appropriate
 * primary-key / index syntax. Adapters use this directly from their
 * `createSchema()` hooks.
 */

import type { ActivityTableSchema, FieldDef, FieldType } from "./schema";

export type Dialect = "postgres" | "mysql" | "sqlite";

const typeMap: Record<Dialect, Record<FieldType, string>> = {
  postgres: {
    string: "TEXT",
    text: "TEXT",
    number: "BIGINT",
    boolean: "BOOLEAN",
    date: "TIMESTAMPTZ",
    json: "JSONB",
  },
  mysql: {
    string: "VARCHAR(255)",
    text: "TEXT",
    number: "BIGINT",
    boolean: "TINYINT(1)",
    date: "DATETIME(3)",
    json: "JSON",
  },
  sqlite: {
    string: "TEXT",
    text: "TEXT",
    number: "INTEGER",
    boolean: "INTEGER",
    date: "TEXT",
    json: "TEXT",
  },
};

function quoteIdent(dialect: Dialect, id: string): string {
  return dialect === "mysql" ? `\`${id}\`` : `"${id}"`;
}

function columnDef(dialect: Dialect, f: FieldDef): string {
  const sqlType = typeMap[dialect][f.type];
  const parts = [quoteIdent(dialect, f.name), sqlType];
  if (f.primary) parts.push("PRIMARY KEY");
  if (f.required && !f.primary) parts.push("NOT NULL");
  if (f.unique && !f.primary) parts.push("UNIQUE");
  return parts.join(" ");
}

export interface GenerateOptions {
  dialect: Dialect;
  /** Wrap in IF NOT EXISTS. @default true */
  ifNotExists?: boolean;
}

/** Generate `CREATE TABLE` + index statements for `schema`. */
export function generateSchemaSQL(
  schema: ActivityTableSchema,
  opts: GenerateOptions,
): string {
  const { dialect } = opts;
  const ifNotExists = opts.ifNotExists ?? true;

  const lines: string[] = [];
  const cols = schema.fields.map((f) => `  ${columnDef(dialect, f)}`);

  lines.push(
    `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${quoteIdent(
      dialect,
      schema.name,
    )} (`,
  );
  lines.push(cols.join(",\n"));
  lines.push(");");
  lines.push("");

  // Single-field indexes
  for (const f of schema.fields) {
    if (!f.indexed) continue;
    const ixName = `${schema.name}_${f.name}_idx`;
    lines.push(
      `CREATE INDEX ${ifNotExists ? "IF NOT EXISTS " : ""}${quoteIdent(
        dialect,
        ixName,
      )} ON ${quoteIdent(dialect, schema.name)} (${quoteIdent(dialect, f.name)});`,
    );
  }

  // Composite indexes
  for (const ix of schema.indexes) {
    const cols = ix.fields.map((c) => quoteIdent(dialect, c)).join(", ");
    lines.push(
      `CREATE INDEX ${ifNotExists ? "IF NOT EXISTS " : ""}${quoteIdent(
        dialect,
        ix.name,
      )} ON ${quoteIdent(dialect, schema.name)} (${cols});`,
    );
  }

  return lines.join("\n") + "\n";
}

export function generatePostgresSQL(s: ActivityTableSchema): string {
  return generateSchemaSQL(s, { dialect: "postgres" });
}

export function generateMySQLSQL(s: ActivityTableSchema): string {
  return generateSchemaSQL(s, { dialect: "mysql" });
}

export function generateSQLiteSQL(s: ActivityTableSchema): string {
  return generateSchemaSQL(s, { dialect: "sqlite" });
}

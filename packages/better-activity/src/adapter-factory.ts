/**
 * `createAdapterFactory` — bridges a `CustomAdapter` (what adapter authors
 * implement) to a `DBAdapter` (what the SDK consumes).
 *
 * Responsibilities:
 *  - Fill in `Where` defaults (`operator`, `connector`, `mode`).
 *  - Generate ids on `create` unless the adapter opts out.
 *  - Serialize `metadata`/`Date`/`boolean` for adapters whose engines do not
 *    natively support those types.
 *  - Provide a `createMany` fallback when the adapter only implements
 *    `create`.
 *  - Provide a `createSchema` fallback via the built-in SQL generator.
 */

import type {
  AdapterFactoryConfig,
  AdapterFactoryOptions,
  CleanedWhere,
  CustomAdapter,
  DBAdapter,
  DBAdapterSchemaCreation,
  Where,
} from "./adapter";
import { generateActivityId } from "./id";
import {
  generateMySQLSQL,
  generatePostgresSQL,
  generateSQLiteSQL,
} from "./migrations";
import { type ActivityTableSchema, getActivityTable } from "./schema";
import type { BetterActivityOptions } from "./types";

function cleanWhere(where: Where[] | undefined): CleanedWhere[] {
  if (!where) return [];
  return where.map((w) => ({
    field: w.field,
    value: w.value as CleanedWhere["value"],
    operator: w.operator ?? "eq",
    connector: w.connector ?? "AND",
    mode: w.mode ?? "sensitive",
  }));
}

/**
 * Replace input values that the target engine cannot store with primitives:
 *  - `Date` → ISO string  (if `supportsDates === false`)
 *  - `boolean` → 0 / 1    (if `supportsBooleans === false`)
 *  - `object`/`Array` → JSON string (if `supportsJSON === false`)
 *
 * The reverse runs in `transformOutput`.
 */
function transformInputRow(
  row: Record<string, unknown>,
  caps: { supportsJSON: boolean; supportsDates: boolean; supportsBooleans: boolean },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (!caps.supportsDates && v instanceof Date) {
      out[k] = v.toISOString();
      continue;
    }
    if (!caps.supportsBooleans && typeof v === "boolean") {
      out[k] = v ? 1 : 0;
      continue;
    }
    if (!caps.supportsJSON && v !== null && (Array.isArray(v) || typeof v === "object") && !(v instanceof Date)) {
      out[k] = JSON.stringify(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * The output transform is field-aware. We need to know that `metadata` was
 * stored as a JSON string so we can parse it back, that `createdAt` should
 * be a `Date`, etc. The factory walks the table schema once.
 */
function makeOutputTransformer(
  table: ActivityTableSchema,
  caps: { supportsJSON: boolean; supportsDates: boolean; supportsBooleans: boolean },
) {
  const byName = new Map(table.fields.map((f) => [f.name, f]));
  return function transformOutput<T>(row: T): T {
    if (!row || typeof row !== "object") return row;
    const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const [k, v] of Object.entries(out)) {
      if (v == null) continue;
      const field = byName.get(k);
      if (!field) continue;
      if (field.type === "json" && !caps.supportsJSON && typeof v === "string") {
        try {
          out[k] = JSON.parse(v);
        } catch {
          /* leave as string */
        }
      } else if (field.type === "date" && !caps.supportsDates && typeof v === "string") {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) out[k] = d;
      } else if (field.type === "boolean" && !caps.supportsBooleans && typeof v === "number") {
        out[k] = v !== 0;
      }
    }
    return out as T;
  };
}

export function createAdapterFactory(
  options: AdapterFactoryOptions,
): (opts: BetterActivityOptions) => DBAdapter {
  const cfg: Required<
    Pick<
      AdapterFactoryConfig,
      "supportsJSON" | "supportsDates" | "supportsBooleans" | "disableIdGeneration" | "debugLogs"
    >
  > &
    AdapterFactoryConfig = {
    supportsJSON: options.config.supportsJSON ?? true,
    supportsDates: options.config.supportsDates ?? true,
    supportsBooleans: options.config.supportsBooleans ?? true,
    disableIdGeneration: options.config.disableIdGeneration ?? false,
    debugLogs: options.config.debugLogs ?? false,
    ...options.config,
  };

  return (userOptions: BetterActivityOptions): DBAdapter => {
    const table = getActivityTable(userOptions.tableName ?? "activity");

    const debugLog = (...args: unknown[]) => {
      if (cfg.debugLogs || userOptions.debugLogs) {
        console.debug(`[${cfg.adapterName ?? cfg.adapterId}]`, ...args);
      }
    };

    const inner: CustomAdapter = options.adapter({
      options: userOptions,
      table,
      debugLog,
    });

    const transformOutput = makeOutputTransformer(table, cfg);
    const caps = {
      supportsJSON: cfg.supportsJSON,
      supportsDates: cfg.supportsDates,
      supportsBooleans: cfg.supportsBooleans,
    };

    const generateId = cfg.generateId ?? (() => generateActivityId());

    const dbAdapter: DBAdapter = {
      id: cfg.adapterId,
      options: inner.options,

      async create({ model, data, select, forceAllowId }) {
        const withId =
          cfg.disableIdGeneration || forceAllowId || (data as { id?: unknown }).id
            ? data
            : { ...(data as Record<string, unknown>), id: generateId({ model }) };
        const row = transformInputRow(withId as Record<string, unknown>, caps);
        const created = await inner.create({ model, data: row, select });
        return transformOutput(created) as never;
      },

      async createMany({ model, data, forceAllowId }) {
        const rows = data.map((d) => {
          const withId =
            cfg.disableIdGeneration || forceAllowId || (d as { id?: unknown }).id
              ? d
              : { ...(d as Record<string, unknown>), id: generateId({ model }) };
          return transformInputRow(withId as Record<string, unknown>, caps);
        });
        if (inner.createMany) {
          const created = await inner.createMany({ model, data: rows });
          return created.map((r) => transformOutput(r)) as never;
        }
        // Fallback: sequential creates.
        const out: unknown[] = [];
        for (const r of rows) {
          out.push(await inner.create({ model, data: r }));
        }
        return out.map((r) => transformOutput(r)) as never;
      },

      async findOne({ model, where, select }) {
        const r = await inner.findOne({ model, where: cleanWhere(where), select });
        return (r ? transformOutput(r) : null) as never;
      },

      async findMany({ model, where, limit, select, sortBy, offset }) {
        const rows = await inner.findMany({
          model,
          where: cleanWhere(where),
          limit: limit ?? 100,
          select,
          sortBy,
          offset,
        });
        return rows.map((r) => transformOutput(r)) as never;
      },

      count({ model, where }) {
        return inner.count({ model, where: cleanWhere(where) });
      },

      async update({ model, where, update }) {
        const r = await inner.update({
          model,
          where: cleanWhere(where),
          update: transformInputRow(update, caps),
        });
        return (r ? transformOutput(r) : null) as never;
      },

      updateMany({ model, where, update }) {
        return inner.updateMany({
          model,
          where: cleanWhere(where),
          update: transformInputRow(update, caps),
        });
      },

      delete({ model, where }) {
        return inner.delete({ model, where: cleanWhere(where) });
      },

      deleteMany({ model, where }) {
        return inner.deleteMany({ model, where: cleanWhere(where) });
      },

      async createSchema(opts, file): Promise<DBAdapterSchemaCreation> {
        if (inner.createSchema) {
          return inner.createSchema({ file, table });
        }
        // Built-in fallback. Dialect is inferred from adapter id.
        const dialect = inferDialectFromAdapterId(cfg.adapterId);
        const code =
          dialect === "postgres"
            ? generatePostgresSQL(table)
            : dialect === "mysql"
              ? generateMySQLSQL(table)
              : generateSQLiteSQL(table);
        return {
          code,
          path: file ?? `./migrations/${cfg.adapterId}-activity.sql`,
          overwrite: false,
        };
      },
    };

    return dbAdapter;
  };
}

function inferDialectFromAdapterId(
  id: string,
): "postgres" | "mysql" | "sqlite" {
  if (id.includes("postgres")) return "postgres";
  if (id.includes("mysql")) return "mysql";
  return "sqlite";
}

/**
 * Adapter contract for `better-activity`.
 *
 * Modeled after `better-auth`'s two-tier adapter design:
 *
 *  - {@link DBAdapter}    The "loose" adapter that the SDK / end-user calls.
 *                         Accepts `Where[]` with defaulted fields.
 *  - {@link CustomAdapter} The "tight" adapter that adapter authors implement.
 *                         Receives already-normalized `CleanedWhere[]`.
 *
 *  `createAdapterFactory` bridges the two so adapter authors do not have to
 *  re-implement where-clause normalization, ID generation, or type coercion.
 */

import type { ActivityTableSchema } from "./schema";
import type { BetterActivityOptions } from "./types";

// ---------------------------------------------------------------------------
// Where clause
// ---------------------------------------------------------------------------

export const whereOperators = [
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
] as const;

export type WhereOperator = (typeof whereOperators)[number];

export type WhereValue =
  | string
  | number
  | boolean
  | Date
  | string[]
  | number[]
  | null;

/**
 * A single where-clause. Multiple clauses are folded left-to-right using the
 * `connector` of each clause. The first clause's `connector` is ignored.
 *
 * The `mode` field makes string comparisons case-insensitive for `eq`/`ne`,
 * `contains`, `starts_with`, and `ends_with`.
 */
export interface Where {
  field: string;
  value: WhereValue;
  /** @default "eq" */
  operator?: WhereOperator;
  /** @default "AND" */
  connector?: "AND" | "OR";
  /** @default "sensitive" */
  mode?: "sensitive" | "insensitive";
}

/** A `Where` with all defaults filled in. Custom adapters receive these. */
export type CleanedWhere = Required<Where>;

// ---------------------------------------------------------------------------
// Pagination + sort
// ---------------------------------------------------------------------------

export interface SortBy {
  field: string;
  direction: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Schema creation result (CLI integration)
// ---------------------------------------------------------------------------

export interface DBAdapterSchemaCreation {
  /** SQL or schema-language source to write to disk. */
  code: string;
  /** Suggested file path (relative to project root). */
  path: string;
  /** Append instead of overwrite. */
  append?: boolean;
  /** Overwrite even if the file exists. */
  overwrite?: boolean;
}

// ---------------------------------------------------------------------------
// DBAdapter — the public adapter that the SDK consumes
// ---------------------------------------------------------------------------

export interface DBAdapter {
  /** Unique adapter id, e.g. `"postgres"`, `"memory"`. */
  id: string;

  create<T extends Record<string, unknown>, R = T>(data: {
    model: string;
    data: T;
    select?: string[];
    /**
     * By default any `id` in `data` is overwritten with a generated one.
     * Pass `true` to keep the caller-supplied id.
     */
    forceAllowId?: boolean;
  }): Promise<R>;

  createMany<T extends Record<string, unknown>, R = T>(data: {
    model: string;
    data: T[];
    forceAllowId?: boolean;
  }): Promise<R[]>;

  findOne<T>(data: {
    model: string;
    where: Where[];
    select?: string[];
  }): Promise<T | null>;

  findMany<T>(data: {
    model: string;
    where?: Where[];
    limit?: number;
    select?: string[];
    sortBy?: SortBy;
    offset?: number;
  }): Promise<T[]>;

  count(data: { model: string; where?: Where[] }): Promise<number>;

  update<T>(data: {
    model: string;
    where: Where[];
    update: Record<string, unknown>;
  }): Promise<T | null>;

  updateMany(data: {
    model: string;
    where: Where[];
    update: Record<string, unknown>;
  }): Promise<number>;

  delete(data: { model: string; where: Where[] }): Promise<void>;

  deleteMany(data: { model: string; where: Where[] }): Promise<number>;

  /**
   * Optional. CLI invokes this to emit a schema/migration file for the
   * configured database. If absent the CLI falls back to the built-in
   * SQL generator in `src/migrations.ts`.
   */
  createSchema?(
    options: BetterActivityOptions,
    file?: string,
  ): Promise<DBAdapterSchemaCreation>;

  /** Adapter-specific options (debugging, internal). */
  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// CustomAdapter — what adapter authors implement
// ---------------------------------------------------------------------------

/**
 * The simplified adapter that `createAdapterFactory` wraps. Compared to
 * `DBAdapter`:
 *
 *  - `where` is always `CleanedWhere[]` (defaults applied).
 *  - `findMany.limit` is always a number (factory supplies a default).
 *  - No ID generation: the factory injects a generated id before `create`.
 *  - No model-name resolution: callers see whatever the user configured.
 */
export interface CustomAdapter {
  create<T extends Record<string, unknown>>(data: {
    model: string;
    data: T;
    select?: string[];
  }): Promise<T>;

  createMany?<T extends Record<string, unknown>>(data: {
    model: string;
    data: T[];
  }): Promise<T[]>;

  findOne<T>(data: {
    model: string;
    where: CleanedWhere[];
    select?: string[];
  }): Promise<T | null>;

  findMany<T>(data: {
    model: string;
    where?: CleanedWhere[];
    limit: number;
    select?: string[];
    sortBy?: SortBy;
    offset?: number;
  }): Promise<T[]>;

  count(data: {
    model: string;
    where?: CleanedWhere[];
  }): Promise<number>;

  update<T>(data: {
    model: string;
    where: CleanedWhere[];
    update: Record<string, unknown>;
  }): Promise<T | null>;

  updateMany(data: {
    model: string;
    where: CleanedWhere[];
    update: Record<string, unknown>;
  }): Promise<number>;

  delete(data: { model: string; where: CleanedWhere[] }): Promise<void>;

  deleteMany(data: { model: string; where: CleanedWhere[] }): Promise<number>;

  createSchema?(props: {
    file?: string;
    table: ActivityTableSchema;
  }): Promise<DBAdapterSchemaCreation>;

  options?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AdapterFactory
// ---------------------------------------------------------------------------

export type AdapterFactoryCreator = (options: BetterActivityOptions) => DBAdapter;

export interface AdapterFactoryConfig {
  /** Stable adapter id (used by the CLI dispatch). */
  adapterId: string;
  /** Human-readable name for debug logs. */
  adapterName?: string;
  /**
   * If the database doesn't natively store JSON, the factory will serialize
   * `metadata` to a JSON string before write and parse on read.
   *
   * @default true
   */
  supportsJSON?: boolean;
  /**
   * If the database doesn't natively store `Date`, the factory converts to/
   * from ISO-8601 strings.
   *
   * @default true
   */
  supportsDates?: boolean;
  /**
   * If the database doesn't natively store booleans (e.g. SQLite), the
   * factory converts to/from `0/1`.
   *
   * @default true
   */
  supportsBooleans?: boolean;
  /**
   * Disable the factory's id-generation step. Useful for adapters whose
   * underlying engine assigns ids (e.g. Postgres `DEFAULT gen_random_uuid()`).
   *
   * @default false
   */
  disableIdGeneration?: boolean;
  /**
   * Custom id generator. Defaults to a sortable lexicographic id derived
   * from the current time + 8 random hex bytes (`act_<ts>_<rand>`).
   */
  generateId?: (ctx: { model: string }) => string;
  /** Print debug logs. */
  debugLogs?: boolean;
}

export interface AdapterFactoryOptions {
  config: AdapterFactoryConfig;
  /**
   * Build the underlying CustomAdapter. Called once per `betterActivity()`
   * call with the resolved options.
   */
  adapter: (deps: {
    options: BetterActivityOptions;
    table: ActivityTableSchema;
    debugLog: (...args: unknown[]) => void;
  }) => CustomAdapter;
}

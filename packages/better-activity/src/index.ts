/**
 * Public entrypoint for `better-activity`.
 *
 * Adapters live behind subpath exports (`better-activity/adapters/postgres`,
 * `…/memory`, etc.) so they can be tree-shaken and so adapter-specific
 * peer dependencies are only imported when needed.
 */

export { betterActivity } from "./better-activity";

export { defineEntity } from "./types";
export type {
  ActivityRecord,
  AfterSaveHook,
  AnyAction,
  BeforeSaveHook,
  BetterActivity,
  BetterActivityOptions,
  BetweenInput,
  ByActorInput,
  Cursor,
  EntitiesConfig,
  EntityConfig,
  EntityName,
  HookContext,
  ListInput,
  MetadataOf,
  PaginateInput,
  PaginateResult,
  ActionOf,
  SaveInput,
  Subscriber,
} from "./types";

export type {
  AdapterFactoryConfig,
  AdapterFactoryOptions,
  CleanedWhere,
  CustomAdapter,
  DBAdapter,
  DBAdapterSchemaCreation,
  SortBy,
  Where,
  WhereOperator,
  WhereValue,
} from "./adapter";
export { whereOperators } from "./adapter";

export { createAdapterFactory } from "./adapter-factory";

export type { ActivityTableSchema, FieldDef, FieldType } from "./schema";
export { getActivityTable } from "./schema";

export {
  generateMySQLSQL,
  generatePostgresSQL,
  generateSQLiteSQL,
  generateSchemaSQL,
  type Dialect,
} from "./migrations";

export { generateActivityId, encodeCursor, decodeCursor } from "./id";
export { applyRedaction, REDACTED_VALUE } from "./redact";

export {
  BetterActivityError,
  HookAbortedError,
  UnknownActionError,
  UnknownEntityError,
} from "./errors";

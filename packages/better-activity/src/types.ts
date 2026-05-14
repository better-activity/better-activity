/**
 * Public type surface for `better-activity`.
 *
 * The library's value-add over a generic audit-log table is type-safe,
 * per-entity action / metadata constraints. Everything below is purely
 * type-level — no runtime overhead.
 */

import type { AdapterFactoryCreator, DBAdapter } from "./adapter";

// ---------------------------------------------------------------------------
// Entity configuration
// ---------------------------------------------------------------------------

/**
 * A single entity definition.
 *
 * - `actions` constrains the `action` field of `save()` calls.
 * - `metadata` is a type-only brand: pass an empty object cast to the type
 *   you want metadata to have for this entity, e.g.
 *
 *   ```ts
 *   user: {
 *     actions: ["logged_in"],
 *     metadata: {} as { ip: string; userAgent: string },
 *   }
 *   ```
 */
export interface EntityConfig<
  TActions extends readonly string[] = readonly string[],
  TMetadata = Record<string, unknown>,
> {
  readonly actions: TActions;
  /** Type-only brand. The runtime value is ignored. */
  readonly metadata?: TMetadata;
  /** Optional human-readable description (used by `describe()`). */
  readonly description?: string;
}

export type EntitiesConfig = Record<string, EntityConfig>;

/**
 * Define an entity. Convenience helper that preserves the `const`-ness of
 * the actions array so callers don't need `as const`.
 */
export function defineEntity<
  const TActions extends readonly string[],
  TMetadata = Record<string, unknown>,
>(config: {
  actions: TActions;
  metadata?: TMetadata;
  description?: string;
}): EntityConfig<TActions, TMetadata> {
  return {
    actions: config.actions,
    description: config.description,
  } as EntityConfig<TActions, TMetadata>;
}

// ---------------------------------------------------------------------------
// Per-entity action / metadata extraction
// ---------------------------------------------------------------------------

export type EntityName<E extends EntitiesConfig> = Extract<keyof E, string>;

/** Union of action names for entity `K` in config `E`. */
export type ActionOf<E extends EntitiesConfig, K extends keyof E> =
  E[K] extends EntityConfig<infer A, infer _>
    ? A extends readonly (infer S)[]
      ? S & string
      : string
    : string;

/** Metadata type for entity `K`. Falls back to `Record<string, unknown>`. */
export type MetadataOf<E extends EntitiesConfig, K extends keyof E> =
  E[K] extends EntityConfig<infer _, infer M>
    ? unknown extends M
      ? Record<string, unknown>
      : M
    : Record<string, unknown>;

/** Union of all action names across all entities. */
export type AnyAction<E extends EntitiesConfig> = {
  [K in keyof E]: ActionOf<E, K>;
}[keyof E];

// ---------------------------------------------------------------------------
// Activity record
// ---------------------------------------------------------------------------

/**
 * A persisted activity event. Generic over entity name + entities config
 * so consumers get a fully-typed `action` field.
 */
export interface ActivityRecord<
  E extends EntitiesConfig = EntitiesConfig,
  K extends EntityName<E> = EntityName<E>,
> {
  id: string;
  entity: K;
  entityId: string;
  action: ActionOf<E, K>;
  actorId: string | null;
  actorType: string | null;
  metadata: MetadataOf<E, K> | null;
  ip: string | null;
  userAgent: string | null;
  /** Free-form correlation id for tracing. */
  requestId: string | null;
  createdAt: Date;
}

/** Input shape for `activity.save()`. */
export interface SaveInput<
  E extends EntitiesConfig,
  K extends EntityName<E> = EntityName<E>,
> {
  entity: K;
  entityId: string;
  action: ActionOf<E, K>;
  actorId?: string | null;
  actorType?: string | null;
  metadata?: MetadataOf<E, K> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** Override the auto-generated id. */
  id?: string;
  /** Override the auto-generated createdAt. */
  createdAt?: Date;
}

// ---------------------------------------------------------------------------
// Query inputs
// ---------------------------------------------------------------------------

export interface ListInput<
  E extends EntitiesConfig,
  K extends EntityName<E> = EntityName<E>,
> {
  entity?: K;
  entityId?: string;
  action?: ActionOf<E, K>;
  actorId?: string;
  /** ISO-8601 string or Date. Inclusive. */
  after?: Date | string;
  /** ISO-8601 string or Date. Exclusive. */
  before?: Date | string;
  limit?: number;
  offset?: number;
  sortBy?: "asc" | "desc";
}

/** Opaque cursor for `paginate()`. */
export type Cursor = string;

export interface PaginateInput<
  E extends EntitiesConfig,
  K extends EntityName<E> = EntityName<E>,
> extends Omit<ListInput<E, K>, "offset"> {
  cursor?: Cursor;
}

export interface PaginateResult<
  E extends EntitiesConfig,
  K extends EntityName<E> = EntityName<E>,
> {
  items: ActivityRecord<E, K>[];
  nextCursor: Cursor | null;
  hasMore: boolean;
}

export interface BetweenInput<
  E extends EntitiesConfig,
  K extends EntityName<E> = EntityName<E>,
> {
  entity?: K;
  from: Date | string;
  to: Date | string;
  limit?: number;
}

export interface ByActorInput {
  actorId: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Hooks / middleware / subscribers
// ---------------------------------------------------------------------------

export interface HookContext<E extends EntitiesConfig> {
  input: SaveInput<E, EntityName<E>>;
  /** Mutate to cancel the save. */
  abort?: { reason: string };
  options: BetterActivityOptions<E>;
}

export type BeforeSaveHook<E extends EntitiesConfig> = (
  ctx: HookContext<E>,
) => void | Promise<void>;

export type AfterSaveHook<E extends EntitiesConfig> = (ctx: {
  record: ActivityRecord<E, EntityName<E>>;
  options: BetterActivityOptions<E>;
}) => void | Promise<void>;

export type Subscriber<E extends EntitiesConfig> = (
  record: ActivityRecord<E, EntityName<E>>,
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface BetterActivityOptions<
  E extends EntitiesConfig = EntitiesConfig,
> {
  /**
   * Adapter created via `postgresAdapter(...)`, `memoryAdapter(...)`, etc.
   */
  database: AdapterFactoryCreator | DBAdapter;

  /**
   * Entity registry — drives type-safety for `save`/`list`/`paginate`.
   * If omitted, the SDK accepts any string for `entity` / `action`.
   */
  entities?: E;

  /**
   * Override the table name. Defaults to `"activity"`.
   */
  tableName?: string;

  /**
   * If true, calling `save()` with an unknown entity or unknown action for a
   * known entity throws. If false, unknown values are persisted as-is.
   *
   * @default true
   */
  strict?: boolean;

  /**
   * Block writes to the database. Useful for dry-runs / disabled environments.
   */
  disabled?: boolean;

  /**
   * Fields whose value will be redacted (replaced with `"[redacted]"`) before
   * being persisted. Dot-paths are supported, e.g. `"user.password"`.
   *
   * Applied to both top-level `SaveInput` fields and the `metadata` blob.
   */
  redact?: string[];

  /**
   * Hooks fired before each `save()`. Throw or set `ctx.abort` to cancel.
   */
  beforeSave?: BeforeSaveHook<E> | BeforeSaveHook<E>[];

  /**
   * Hooks fired after each successful `save()`.
   */
  afterSave?: AfterSaveHook<E> | AfterSaveHook<E>[];

  /**
   * Print debug logs.
   */
  debugLogs?: boolean;

  /**
   * Custom id generator. Defaults to `act_<ts36>_<rand8>`.
   */
  generateId?: (ctx: { entity: string }) => string;
}

// ---------------------------------------------------------------------------
// Public surface returned by betterActivity()
// ---------------------------------------------------------------------------

export interface BetterActivity<E extends EntitiesConfig = EntitiesConfig> {
  /** Persist a single event. */
  save<K extends EntityName<E>>(
    input: SaveInput<E, K>,
  ): Promise<ActivityRecord<E, K>>;

  /** Persist many events in one round trip. */
  saveMany(inputs: Array<SaveInput<E, EntityName<E>>>): Promise<
    Array<ActivityRecord<E, EntityName<E>>>
  >;

  /** List events. Filter + sort + offset pagination. */
  list<K extends EntityName<E>>(
    input?: ListInput<E, K>,
  ): Promise<ActivityRecord<E, K>[]>;

  /** Cursor-based pagination. Stable under concurrent inserts. */
  paginate<K extends EntityName<E>>(
    input: PaginateInput<E, K>,
  ): Promise<PaginateResult<E, K>>;

  /** All events authored by a given actor. */
  byActor(input: ByActorInput): Promise<ActivityRecord<E, EntityName<E>>[]>;

  /** Events in a time range (inclusive `from`, exclusive `to`). */
  between<K extends EntityName<E>>(
    input: BetweenInput<E, K>,
  ): Promise<ActivityRecord<E, K>[]>;

  /** Count events matching a filter. */
  count(input?: Omit<ListInput<E, EntityName<E>>, "limit" | "offset" | "sortBy">): Promise<number>;

  /** Delete events. Use with care — audit logs are usually append-only. */
  purge(input: {
    entity?: EntityName<E>;
    entityId?: string;
    /** Delete events older than this. */
    before?: Date;
  }): Promise<number>;

  /** Register an in-process subscriber (real-time event fan-out). */
  subscribe(listener: Subscriber<E>): () => void;

  /** Append a `beforeSave` hook at runtime. */
  use(hook: BeforeSaveHook<E>): () => void;

  /** Resolved options (after defaults applied). */
  readonly options: Required<
    Pick<BetterActivityOptions<E>, "tableName" | "strict" | "debugLogs">
  > &
    BetterActivityOptions<E>;

  /** Underlying adapter. Escape hatch. */
  readonly adapter: DBAdapter;

  /**
   * Type-only namespace exposing inferred record / input shapes for
   * a given entity. Use as `type UserEvent = typeof activity.$Infer.UserEvent`.
   */
  readonly $Infer: {
    Record: ActivityRecord<E, EntityName<E>>;
    SaveInput: SaveInput<E, EntityName<E>>;
    Entities: E;
  };
}

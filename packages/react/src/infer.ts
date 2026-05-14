/**
 * Type inference helpers.
 *
 * Take a `betterActivity({...})` instance and recover:
 *
 *  - the entities config (`InferEntities`)
 *  - the entity-name union (`InferEntityName`)
 *  - per-entity action / metadata unions (`InferAction`, `InferMetadata`)
 *  - a discriminated union of `ActivityRecord`s (`InferActivity` / `InferRecord`)
 *
 * The package imports these *types only*, so there is no runtime dependency
 * on `better-activity`.
 */

import type {
  ActionOf,
  ActivityRecord,
  BetterActivity,
  EntitiesConfig,
  EntityName,
  MetadataOf,
} from "better-activity";

// ---------------------------------------------------------------------------
// Generic narrowing
// ---------------------------------------------------------------------------

/** Extract the `EntitiesConfig` from a `BetterActivity` instance. */
export type InferEntities<TActivity> =
  TActivity extends BetterActivity<infer E> ? E : EntitiesConfig;

/** Union of entity names declared on the activity instance. */
export type InferEntityName<TActivity> = EntityName<InferEntities<TActivity>>;

/** Union of action names for a specific entity (or across all entities). */
export type InferAction<
  TActivity,
  K extends InferEntityName<TActivity> = InferEntityName<TActivity>,
> = ActionOf<InferEntities<TActivity>, K>;

/** Metadata type for a specific entity. */
export type InferMetadata<
  TActivity,
  K extends InferEntityName<TActivity>,
> = MetadataOf<InferEntities<TActivity>, K>;

/**
 * Single non-discriminated record type — `action`/`metadata` are widened
 * to the union across all entities. Useful when you don't need narrowing.
 */
export type InferRecord<TActivity> = ActivityRecord<
  InferEntities<TActivity>,
  InferEntityName<TActivity>
>;

/**
 * Discriminated union of records, one branch per entity. Inside each
 * branch, `action` is narrowed to that entity's actions and `metadata` is
 * narrowed to that entity's metadata type.
 *
 * @example
 * ```ts
 * type Event = InferActivity<typeof activity>
 *
 * function render(ev: Event) {
 *   if (ev.entity === "user") {
 *     ev.action // "logged_in" | "logged_out" | …
 *     ev.metadata // { ip?: string; userAgent?: string }
 *   }
 * }
 * ```
 */
export type InferActivity<TActivity> = TActivity extends BetterActivity<infer E>
  ? E extends EntitiesConfig
    ? { [K in EntityName<E>]: ActivityRecord<E, K> }[EntityName<E>]
    : ActivityRecord<EntitiesConfig>
  : ActivityRecord<EntitiesConfig>;

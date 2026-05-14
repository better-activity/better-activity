/**
 * `betterActivity()` — the main factory.
 *
 * Generic-driven so TypeScript can infer:
 *   - entity names
 *   - per-entity action constraints
 *   - per-entity metadata types
 *
 * The trick: `<const O extends BetterActivityOptions>(opts: O & {})`.
 *
 *  - `const O` preserves the literal types of nested arrays/tuples (so
 *    `actions: ["created", "logged_in"]` becomes the literal tuple, not
 *    `string[]`).
 *  - `Options & {}` (a no-op intersection) forces TS to keep the narrowed
 *    type instead of collapsing to the constraint.
 */

import type { DBAdapter } from "./adapter";
import { HookAbortedError, UnknownActionError, UnknownEntityError } from "./errors";
import { decodeCursor, encodeCursor, generateActivityId } from "./id";
import { applyRedaction } from "./redact";
import type {
  ActivityRecord,
  AfterSaveHook,
  BeforeSaveHook,
  BetterActivity,
  BetterActivityOptions,
  ByActorInput,
  EntitiesConfig,
  EntityName,
  ListInput,
  PaginateInput,
  PaginateResult,
  SaveInput,
  Subscriber,
  BetweenInput,
} from "./types";

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function toDate(v: Date | string | undefined): Date | undefined {
  if (!v) return undefined;
  return v instanceof Date ? v : new Date(v);
}

function isAdapterCreator(
  d: BetterActivityOptions["database"],
): d is (opts: BetterActivityOptions) => DBAdapter {
  return typeof d === "function";
}

/**
 * Build a `BetterActivity` instance.
 *
 * @example
 * ```ts
 * const activity = betterActivity({
 *   database: memoryAdapter({}),
 *   entities: {
 *     user: { actions: ["created", "updated", "logged_in"] },
 *   },
 * })
 * ```
 */
export function betterActivity<
  const O extends BetterActivityOptions,
>(options: O & {}): BetterActivity<
  O extends BetterActivityOptions<infer E> ? E : EntitiesConfig
> {
  type E = O extends BetterActivityOptions<infer X> ? X : EntitiesConfig;
  const resolved: BetterActivityOptions<E> = {
    tableName: "activity",
    strict: true,
    debugLogs: false,
    ...(options as unknown as BetterActivityOptions<E>),
  };

  const adapter: DBAdapter = isAdapterCreator(resolved.database!)
    ? resolved.database!(resolved as unknown as BetterActivityOptions)
    : (resolved.database as DBAdapter);

  const tableName = resolved.tableName ?? "activity";
  const beforeHooks: BeforeSaveHook<E>[] = asArray(resolved.beforeSave);
  const afterHooks: AfterSaveHook<E>[] = asArray(resolved.afterSave);
  const subscribers = new Set<Subscriber<E>>();

  function validate(input: SaveInput<E, EntityName<E>>): void {
    if (!resolved.strict) return;
    const entities = resolved.entities;
    if (!entities) return;
    const e = entities[input.entity as keyof E];
    if (!e) throw new UnknownEntityError(input.entity as string);
    if (!e.actions.includes(input.action as string)) {
      throw new UnknownActionError(input.entity as string, input.action as string, e.actions);
    }
  }

  function normalize(
    input: SaveInput<E, EntityName<E>>,
  ): Record<string, unknown> {
    const id = input.id ?? (resolved.generateId
      ? resolved.generateId({ entity: input.entity as string })
      : generateActivityId());
    const base: Record<string, unknown> = {
      id,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? null,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
      createdAt: input.createdAt ?? new Date(),
    };
    return applyRedaction(base, resolved.redact);
  }

  async function runBeforeHooks(input: SaveInput<E, EntityName<E>>): Promise<void> {
    if (beforeHooks.length === 0) return;
    for (const h of beforeHooks) {
      const ctx = {
        input,
        options: resolved,
      } as Parameters<BeforeSaveHook<E>>[0];
      await h(ctx);
      if (ctx.abort) throw new HookAbortedError(ctx.abort.reason);
    }
  }

  async function runAfterHooks(record: ActivityRecord<E, EntityName<E>>): Promise<void> {
    if (afterHooks.length === 0 && subscribers.size === 0) return;
    for (const h of afterHooks) {
      await h({ record, options: resolved });
    }
    for (const s of subscribers) {
      try {
        await s(record);
      } catch (e) {
        if (resolved.debugLogs) {
          console.error("[better-activity] subscriber error", e);
        }
      }
    }
  }

  const api: BetterActivity<E> = {
    options: resolved as never,
    adapter,
    $Infer: undefined as never,

    async save<K extends EntityName<E>>(input: SaveInput<E, K>) {
      if (resolved.disabled) {
        return normalize(input as SaveInput<E, EntityName<E>>) as never;
      }
      validate(input as SaveInput<E, EntityName<E>>);
      await runBeforeHooks(input as SaveInput<E, EntityName<E>>);
      const row = normalize(input as SaveInput<E, EntityName<E>>);
      const created = await adapter.create<Record<string, unknown>, ActivityRecord<E, K>>({
        model: tableName,
        data: row,
        forceAllowId: true,
      });
      await runAfterHooks(created as ActivityRecord<E, EntityName<E>>);
      return created;
    },

    async saveMany(inputs) {
      if (inputs.length === 0) return [];
      if (resolved.disabled) {
        return inputs.map((i) => normalize(i)) as never;
      }
      for (const i of inputs) validate(i);
      await Promise.all(inputs.map((i) => runBeforeHooks(i)));
      const rows = inputs.map((i) => normalize(i));
      const created = await adapter.createMany<Record<string, unknown>, ActivityRecord<E, EntityName<E>>>({
        model: tableName,
        data: rows,
        forceAllowId: true,
      });
      await Promise.all(created.map((r) => runAfterHooks(r)));
      return created;
    },

    async list(input) {
      const where: import("./adapter").Where[] = [];
      if (input?.entity) where.push({ field: "entity", value: input.entity as string });
      if (input?.entityId) where.push({ field: "entityId", value: input.entityId });
      if (input?.action) where.push({ field: "action", value: input.action as string });
      if (input?.actorId) where.push({ field: "actorId", value: input.actorId });
      if (input?.after) where.push({ field: "createdAt", value: toDate(input.after)!, operator: "gte" });
      if (input?.before) where.push({ field: "createdAt", value: toDate(input.before)!, operator: "lt" });
      const rows = await adapter.findMany<ActivityRecord<E, EntityName<E>>>({
        model: tableName,
        where,
        limit: input?.limit ?? 100,
        offset: input?.offset,
        sortBy: { field: "createdAt", direction: input?.sortBy ?? "desc" },
      });
      return rows as never;
    },

    async paginate(input) {
      const limit = input.limit ?? 50;
      const where: import("./adapter").Where[] = [];
      if (input.entity) where.push({ field: "entity", value: input.entity as string });
      if (input.entityId) where.push({ field: "entityId", value: input.entityId });
      if (input.action) where.push({ field: "action", value: input.action as string });
      if (input.actorId) where.push({ field: "actorId", value: input.actorId });
      if (input.after) where.push({ field: "createdAt", value: toDate(input.after)!, operator: "gte" });
      if (input.before) where.push({ field: "createdAt", value: toDate(input.before)!, operator: "lt" });
      if (input.cursor) {
        const c = decodeCursor(input.cursor);
        if (c) {
          // descending sort → "older than the cursor"
          where.push({
            field: "createdAt",
            value: new Date(c.ts),
            operator: "lt",
          });
        }
      }
      // Fetch one extra to determine hasMore.
      const rows = await adapter.findMany<ActivityRecord<E, EntityName<E>>>({
        model: tableName,
        where,
        limit: limit + 1,
        sortBy: { field: "createdAt", direction: input.sortBy ?? "desc" },
      });
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const last = items[items.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor({ id: last.id, createdAt: last.createdAt })
        : null;
      return { items, hasMore, nextCursor } as never;
    },

    async byActor(input: ByActorInput) {
      const rows = await adapter.findMany<ActivityRecord<E, EntityName<E>>>({
        model: tableName,
        where: [{ field: "actorId", value: input.actorId }],
        limit: input.limit ?? 100,
        sortBy: { field: "createdAt", direction: "desc" },
      });
      return rows;
    },

    async between(input: BetweenInput<E, EntityName<E>>) {
      const where: import("./adapter").Where[] = [
        { field: "createdAt", value: toDate(input.from)!, operator: "gte" },
        { field: "createdAt", value: toDate(input.to)!, operator: "lt" },
      ];
      if (input.entity) where.push({ field: "entity", value: input.entity as string });
      const rows = await adapter.findMany<ActivityRecord<E, EntityName<E>>>({
        model: tableName,
        where,
        limit: input.limit ?? 1000,
        sortBy: { field: "createdAt", direction: "asc" },
      });
      return rows as never;
    },

    async count(input) {
      const where: import("./adapter").Where[] = [];
      if (input?.entity) where.push({ field: "entity", value: input.entity as string });
      if (input?.entityId) where.push({ field: "entityId", value: input.entityId });
      if (input?.action) where.push({ field: "action", value: input.action as string });
      if (input?.actorId) where.push({ field: "actorId", value: input.actorId });
      if (input?.after) where.push({ field: "createdAt", value: toDate(input.after)!, operator: "gte" });
      if (input?.before) where.push({ field: "createdAt", value: toDate(input.before)!, operator: "lt" });
      return adapter.count({ model: tableName, where });
    },

    async purge(input) {
      const where: import("./adapter").Where[] = [];
      if (input.entity) where.push({ field: "entity", value: input.entity as string });
      if (input.entityId) where.push({ field: "entityId", value: input.entityId });
      if (input.before) where.push({ field: "createdAt", value: input.before, operator: "lt" });
      if (where.length === 0) {
        throw new Error("purge() requires at least one filter (entity / entityId / before).");
      }
      return adapter.deleteMany({ model: tableName, where });
    },

    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },

    use(hook) {
      beforeHooks.push(hook);
      return () => {
        const i = beforeHooks.indexOf(hook);
        if (i >= 0) beforeHooks.splice(i, 1);
      };
    },
  };

  return api as never;
}

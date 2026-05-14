<!-- markdownlint-disable -->

# better-activity

A fully-typed activity / audit log library for TypeScript. Framework-agnostic, multi-database, and modeled on the architecture of [`better-auth`](https://github.com/better-auth/better-auth).

- **Type-safe per entity.** Declare entities + their allowed actions once; `save()` is checked against them at compile time.
- **Adapter-based.** Plug in your existing database connection. Postgres, MySQL, SQLite, MongoDB, Drizzle, Prisma, Kysely.
- **Flexible metadata.** Arbitrary JSON per event, strongly typed when you opt in.
- **Cursor pagination, by-actor lookups, time-range queries, in-process subscribers, before/after hooks, PII redaction.**
- **CLI** to generate or apply the schema for the configured adapter.

## Install

```bash
pnpm add better-activity
# plus the driver you use:
pnpm add pg                 # Postgres
pnpm add mysql2             # MySQL
pnpm add better-sqlite3     # SQLite
pnpm add mongodb            # MongoDB
pnpm add kysely             # Kysely
pnpm add drizzle-orm        # Drizzle
pnpm add @prisma/client     # Prisma
```

## Quickstart

```ts
import { betterActivity } from "better-activity";
import { postgresAdapter } from "better-activity/adapters/postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const activity = betterActivity({
  database: postgresAdapter({ pool }),
  entities: {
    user: {
      actions: ["created", "updated", "deleted", "logged_in", "logged_out"],
      // Optional per-entity metadata type — `save({ entity: "user", metadata: ... })` is now typed.
      metadata: {} as { ip?: string; userAgent?: string },
    },
    project: {
      actions: ["created", "archived", "restored", "member_added"],
    },
  },
});

// Record an event
await activity.save({
  entity: "user",
  entityId: "usr_123",
  action: "logged_in",
  actorId: "usr_123",
  metadata: { ip: "1.2.3.4" },
});

// Query
const events = await activity.list({
  entity: "project",
  entityId: "prj_456",
  limit: 50,
});

// Cursor pagination
let cursor: string | undefined;
do {
  const page = await activity.paginate({ entity: "user", cursor, limit: 100 });
  for (const e of page.items) handle(e);
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

## Type-safety examples

```ts
// ✅ valid
await activity.save({ entity: "user", entityId: "u1", action: "logged_in" });

// ✗ TypeScript error — "archived" is not a `user` action
await activity.save({ entity: "user", entityId: "u1", action: "archived" });

// ✗ TypeScript error — "ghost" is not in entities
await activity.save({ entity: "ghost", entityId: "x", action: "created" });

// metadata is constrained per entity
await activity.save({
  entity: "user",
  entityId: "u1",
  action: "logged_in",
  metadata: {
    ip: "1.2.3.4",
    // ✗ TS error if you set a property not in the entity's metadata type
  },
});
```

You can also `defineEntity` for clarity and reuse:

```ts
import { defineEntity } from "better-activity";

const user = defineEntity({
  actions: ["logged_in", "logged_out"],
  metadata: {} as { ip: string },
});
```

## API

### `betterActivity(options)`

| Option            | Type                                         | Description                                                                |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| `database`        | `AdapterFactoryCreator \| DBAdapter`         | Adapter from `better-activity/adapters/*`.                                 |
| `entities`        | `Record<string, EntityConfig>`               | Declares entities + actions + (optional) metadata type.                    |
| `tableName`       | `string`                                     | Defaults to `"activity"`.                                                  |
| `strict`          | `boolean`                                    | Reject unknown entity / action at runtime. Default `true`.                 |
| `disabled`        | `boolean`                                    | Skip database writes (useful for dry-runs and CI).                         |
| `redact`          | `string[]`                                   | Dot-paths to scrub before persistence (e.g. `metadata.password`).          |
| `beforeSave`      | `BeforeSaveHook \| BeforeSaveHook[]`         | Hooks fired before each save; set `ctx.abort` to cancel.                   |
| `afterSave`       | `AfterSaveHook \| AfterSaveHook[]`           | Hooks fired after each save.                                               |
| `generateId`      | `(ctx) => string`                            | Custom id generator. Defaults to `act_<ts36>_<rand>`.                      |
| `debugLogs`       | `boolean`                                    | Print SQL / queries to the console.                                        |

### SDK methods

| Method                 | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `save(input)`          | Persist a single event.                                            |
| `saveMany(inputs)`     | Bulk insert.                                                       |
| `list(filter?)`        | Filter + offset pagination.                                        |
| `paginate(input)`      | Cursor pagination (stable under concurrent inserts).               |
| `byActor({ actorId })` | All events authored by an actor.                                   |
| `between({ from, to })`| Inclusive `from`, exclusive `to`.                                  |
| `count(filter?)`       | Counter with the same filters as `list`.                           |
| `purge({...})`         | Hard-delete events (requires at least one filter).                 |
| `subscribe(fn)`        | Register an in-process listener; returns an unsubscribe function.  |
| `use(hook)`            | Append a `beforeSave` hook at runtime.                             |
| `adapter`              | Escape hatch — raw `DBAdapter`.                                    |
| `options`              | Resolved options after defaults applied.                           |
| `$Infer`               | Type-only namespace: `typeof activity.$Infer.Record`, etc.         |

## Adapters

| Subpath                                | Database / driver       | Status            |
| -------------------------------------- | ----------------------- | ----------------- |
| `better-activity/adapters/memory`      | In-memory (testing)     | First-class       |
| `better-activity/adapters/postgres`    | `pg` (Postgres)         | First-class       |
| `better-activity/adapters/mysql`       | `mysql2`                | First-class       |
| `better-activity/adapters/sqlite`      | `better-sqlite3`        | First-class       |
| `better-activity/adapters/mongodb`     | `mongodb` 6.x           | First-class       |
| `better-activity/adapters/kysely`      | `kysely`                | First-class       |
| `better-activity/adapters/drizzle`     | `drizzle-orm`           | First-class       |
| `better-activity/adapters/prisma`      | `@prisma/client`        | First-class       |

Writing your own adapter is a single function call:

```ts
import { createAdapterFactory } from "better-activity";

export const myAdapter = (deps: MyDeps) =>
  createAdapterFactory({
    config: { adapterId: "my-store" },
    adapter: ({ table }) => ({
      async create({ data })       { /* ... */ },
      async findOne({ where, … }) { /* ... */ },
      async findMany({ where, … }){ /* ... */ },
      async count({ where })       { /* ... */ },
      async update({ where, … })   { /* ... */ },
      async updateMany({ where, … }){ /* ... */ },
      async delete({ where })      { /* ... */ },
      async deleteMany({ where })  { /* ... */ },
    }),
  });
```

The factory fills in `Where` defaults, generates IDs, and serializes JSON/Date/boolean values for engines that need it.

## CLI

```bash
# Print the schema SQL to stdout
better-activity schema --config ./better-activity.config.ts

# Generate the migration file
better-activity generate --config ./better-activity.config.ts --out ./migrations/0001_activity.sql

# Apply it (Postgres / MySQL / SQLite only)
better-activity migrate --config ./better-activity.config.ts
```

`better-activity.config.ts` must export the `betterActivity()` instance as `default`:

```ts
import { betterActivity } from "better-activity";
import { postgresAdapter } from "better-activity/adapters/postgres";
import { Pool } from "pg";

export default betterActivity({
  database: postgresAdapter({ pool: new Pool() }),
  entities: { /* ... */ },
});
```

## Schema

The canonical `activity` table:

| Column      | Type        | Notes                            |
| ----------- | ----------- | -------------------------------- |
| `id`        | TEXT        | Primary key. Sortable.           |
| `entity`    | TEXT        | Indexed; composite w/ `entityId`.|
| `entityId`  | TEXT        |                                  |
| `action`    | TEXT        | Indexed.                         |
| `actorId`   | TEXT        | Indexed; nullable.               |
| `actorType` | TEXT        | Nullable.                        |
| `metadata`  | JSONB/JSON/TEXT | Per dialect.                 |
| `ip`        | TEXT        | Nullable.                        |
| `userAgent` | TEXT        | Nullable.                        |
| `requestId` | TEXT        | Nullable; for trace correlation. |
| `createdAt` | TIMESTAMPTZ | Indexed.                         |

## Design

The library splits into two adapter tiers (a pattern taken from `better-auth`):

- `DBAdapter` — what the SDK consumes; accepts a loose `Where[]`.
- `CustomAdapter` — what adapter authors implement; receives already-normalized `CleanedWhere[]`.

`createAdapterFactory` bridges them and handles the boring parts (defaults, ID generation, JSON / Date / boolean translation, schema generation).

The factory's `(options) => DBAdapter` curry mirrors `better-auth`: you build the adapter with its connection at module-load and `betterActivity()` threads the resolved options through at init.

## License

MIT.

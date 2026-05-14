# better-activity

A fully-typed activity and audit log library for TypeScript. Framework-agnostic, multi-database, modeled on the architecture of [`better-auth`](https://github.com/better-auth/better-auth).

## Packages

| Package | Description |
| ------- | ----------- |
| [`better-activity`](./packages/better-activity) | Core SDK — adapters, CLI, type-safe `save` / `list` / `paginate` |
| [`@better-activity/react`](./packages/react) | React hooks and headless components |

## Features

- **Type-safe per entity.** Declare entities and their allowed actions once; `save()` is checked at compile time.
- **Adapter-based.** Postgres, MySQL, SQLite, MongoDB, Drizzle, Prisma, Kysely, and in-memory (for tests).
- **Flexible metadata.** Arbitrary JSON per event, strongly typed when you opt in.
- **Cursor pagination, by-actor lookups, time-range queries, in-process subscribers, before/after hooks, PII redaction.**
- **CLI** to generate or apply the schema for the configured adapter.
- **React layer** with built-in cache, optimistic inserts, realtime subscriptions, and optional TanStack Query / SWR adapters.

## Install

```bash
pnpm add better-activity
# plus the driver you use:
pnpm add pg                 # Postgres
pnpm add mysql2             # MySQL
pnpm add better-sqlite3     # SQLite
pnpm add mongodb            # MongoDB

# optional React layer
pnpm add @better-activity/react react
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
```

Full API docs: [`packages/better-activity`](./packages/better-activity/README.md)

## React

```tsx
import { useActivity } from "@better-activity/react";

export function Feed({ projectId }: { projectId: string }) {
  const { data, isLoading, loadMore, hasMore } = useActivity<AppActivity>({
    fetcher: fetchActivity,
    entity: "project",
    entityId: projectId,
    limit: 25,
  });

  if (isLoading) return <Spinner />;
  return (
    <>
      {data.map((r) => <Row key={r.id} record={r} />)}
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </>
  );
}
```

Full API docs: [`packages/react`](./packages/react/README.md)

## Demo

A Hono + Drizzle + Postgres demo lives in [`demo/hono`](./demo/hono).

```bash
cd demo/hono
cp .env.example .env   # set DATABASE_URL
bun install
bun run dev
```

## Development

This is a pnpm monorepo.

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # run all tests
```

## License

MIT.

<!-- markdownlint-disable -->

# @better-activity/react

React hooks and headless components for [`better-activity`](../better-activity). Fetcher-agnostic, fully typed, zero runtime dependency on the core package.

- **Bring-your-own fetcher.** REST, tRPC, GraphQL, server actions, RSC bridge — anything that returns a `Promise<ActivityPage>`.
- **Headless.** Render-prop components, no markup, no styles.
- **Type-safe end-to-end.** Hook generics, render-prop arguments, formatter maps, and adapter wrappers all flow from `InferActivity<typeof activity>`.
- **Built-in cache + pub/sub.** Multiple hooks watching the same query share state, refetches dedupe, optimistic inserts replay across the tree.
- **Optional adapters** for TanStack Query and SWR at subpath exports.

## Design note

The React layer is deliberately decoupled from the core runtime:

1. **Fetcher-agnostic.** The library never knows how data reaches it. Consumers pass an async function (`ActivityFetcher`) and the hooks own everything that comes after the network: caching, pagination, dedup, optimistic updates, subscription fan-out.
2. **Headless first.** Components like `<ActivityFeed>` are render-prop wrappers. The consuming app fully owns markup and styling.
3. **Type-safe end-to-end.** `InferActivity<typeof activity>` walks the core's `BetterActivity<E>` generic and reconstructs a discriminated union of `ActivityRecord`s, narrowed by entity. All hook generics flow from that type.
4. **Zero runtime dependency on `better-activity`.** This package imports *types only* from the core. The React layer ships and versions independently.

## Install

```bash
pnpm add @better-activity/react better-activity react
# optional adapters
pnpm add @tanstack/react-query   # for ./tanstack
pnpm add swr                     # for ./swr
```

## Quickstart with a custom fetcher

```tsx
// app/lib/activity-client.ts
import type { ActivityFetcher } from "@better-activity/react";
import type { activity } from "@/server/activity"; // your betterActivity({...}) instance
import type { InferActivity } from "@better-activity/react";

export type AppActivity = InferActivity<typeof activity>;

export const fetchActivity: ActivityFetcher<AppActivity> = async (query, { signal }) => {
  const res = await fetch("/api/activity?" + new URLSearchParams(query as Record<string, string>), { signal });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
};
```

```tsx
// app/components/feed.tsx
"use client";
import { useActivity } from "@better-activity/react";
import { fetchActivity, type AppActivity } from "@/lib/activity-client";

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
      {data.map((r) => (
        <Row key={r.id} record={r} />
      ))}
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </>
  );
}
```

## Provider — configure once

```tsx
// app/providers.tsx
import { ActivityProvider } from "@better-activity/react";
import { fetchActivity, recordActivity, subscribeActivity } from "@/lib/activity-client";

export function Providers({ children }) {
  return (
    <ActivityProvider
      fetcher={fetchActivity}
      recordFn={recordActivity}
      subscribe={subscribeActivity}
      defaultLimit={50}
      staleTime={30_000}
    >
      {children}
    </ActivityProvider>
  );
}
```

Children can now call `useActivity({ entity: "user" })` without passing `fetcher` every time.

## Next.js App Router — server fetch + client hydration

```tsx
// app/projects/[id]/page.tsx — Server Component
import { activity } from "@/server/activity";
import { Feed } from "./feed";

export default async function Page({ params }: { params: { id: string } }) {
  // Server-side: call the core SDK directly, no HTTP hop.
  const initial = await activity.paginate({
    entity: "project",
    entityId: params.id,
    limit: 25,
  });
  return <Feed projectId={params.id} initialData={initial} />;
}
```

```tsx
// app/projects/[id]/feed.tsx — Client Component
"use client";
import { useActivity, type ActivityPage } from "@better-activity/react";
import { fetchActivity, type AppActivity } from "@/lib/activity-client";

export function Feed({
  projectId,
  initialData,
}: {
  projectId: string;
  initialData: ActivityPage<AppActivity>;
}) {
  const { data, loadMore, hasMore } = useActivity<AppActivity>({
    fetcher: fetchActivity,
    entity: "project",
    entityId: projectId,
    initialData,         // skips the loading state on first paint
    staleTime: 60_000,   // do not refetch if the server's data is < 60s old
  });
  return (
    <ul>
      {data.map((r) => <li key={r.id}>{r.action}</li>)}
      {hasMore && <button onClick={loadMore}>more</button>}
    </ul>
  );
}
```

## Optimistic mutations

```tsx
"use client";
import { useRecordActivity } from "@better-activity/react";
import { recordActivity, type AppActivity } from "@/lib/activity-client";

export function StarButton({ projectId }) {
  const { mutate, isPending } = useRecordActivity<{ entity: string; entityId: string; action: string }, AppActivity>({
    recordFn: recordActivity,
    optimistic: (input) => ({
      id: "__tmp",
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      actorId: null,
      actorType: null,
      metadata: null,
      ip: null,
      userAgent: null,
      requestId: null,
      createdAt: new Date(),
    } as AppActivity),
  });
  return (
    <button
      disabled={isPending}
      onClick={() => mutate({ entity: "project", entityId: projectId, action: "starred" })}
    >
      ★
    </button>
  );
}
```

The optimistic record is inserted into every `useActivity` cache whose query predicate matches (entity / entityId / actorId / action). On success it's replaced by the server record; on error it's rolled back automatically. While in flight it carries `optimistic: true` on the record so callers can dim the row.

## Realtime subscription

```tsx
"use client";
import { useActivitySubscription } from "@better-activity/react";

export function RealtimeBridge() {
  useActivitySubscription({
    subscribe: (onEvent, { onError }) => {
      const sock = new EventSource("/api/activity/stream");
      sock.onmessage = (e) => onEvent(JSON.parse(e.data));
      sock.onerror = () => onError?.(new Error("stream dropped"));
      return () => sock.close();
    },
  });
  return null;
}
```

Drop this once near the root of your tree. Incoming events flow into every matching `useActivity` cache automatically.

## Type inference from `betterActivity({...})`

```ts
// server/activity.ts
import { betterActivity } from "better-activity";

export const activity = betterActivity({
  database: postgresAdapter({ pool }),
  entities: {
    user:    { actions: ["created", "logged_in", "logged_out"], metadata: {} as { ip: string } },
    project: { actions: ["created", "archived", "restored"],    metadata: {} as { teamId: string } },
  },
});
```

```ts
// shared/types.ts
import type { InferActivity, InferAction, InferMetadata } from "@better-activity/react";
import type { activity } from "@/server/activity";

export type AppActivity = InferActivity<typeof activity>;
//          ^ discriminated union over entity:
//            | ActivityRecord<E, "user">
//            | ActivityRecord<E, "project">

type UserActions = InferAction<typeof activity, "user">;
//                 ^ "created" | "logged_in" | "logged_out"

type ProjectMeta = InferMetadata<typeof activity, "project">;
//                 ^ { teamId: string }
```

When a function narrows on `entity`, TypeScript narrows `action` and `metadata` automatically:

```ts
function render(ev: AppActivity) {
  if (ev.entity === "user") {
    ev.action; // "created" | "logged_in" | "logged_out"
    ev.metadata; // { ip: string } | null
  } else {
    ev.action; // "created" | "archived" | "restored"
  }
}
```

## Headless components

```tsx
import { ActivityFeed, ActivityItem } from "@better-activity/react/components";
import { defineFormatters } from "@better-activity/react/formatters";

const formatters = defineFormatters<typeof activity>({
  user: {
    logged_in: (r) => ({
      title: `${r.actorId} signed in from ${r.metadata?.ip ?? "unknown"}`,
      icon: "🔐",
    }),
  },
  project: {
    archived: (r) => ({ title: `${r.entityId} archived`, icon: "📦" }),
  },
});

<ActivityFeed entity="project" entityId="prj_1">
  {({ data, isLoading, loadMore, hasMore }) => (
    isLoading ? <Spinner /> :
    <ul>
      {data.map((r) => (
        <ActivityItem key={r.id} record={r} formatters={formatters}>
          {({ title, timeAgo, icon }) => (
            <li>{icon} {title} <small>{timeAgo}</small></li>
          )}
        </ActivityItem>
      ))}
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </ul>
  )}
</ActivityFeed>
```

## TanStack Query adapter

```tsx
import { useActivityQuery, useActivityInfiniteQuery } from "@better-activity/react/tanstack";

const { data, isLoading, refetch } = useActivityQuery({
  fetcher: fetchActivity,
  entity: "user",
});

const { data, pages, fetchNextPage, hasMore } = useActivityInfiniteQuery({
  fetcher: fetchActivity,
  entity: "user",
  limit: 50,
});
```

Same surface as the built-in hooks. Cache + devtools come from TanStack Query.

## SWR adapter

```tsx
import { useActivitySWR, useActivityInfiniteSWR } from "@better-activity/react/swr";
```

## API reference

### Hooks

| Hook                       | Returns                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `useActivity`              | `{ data, isLoading, isFetching, error, hasMore, refetch, loadMore, query }` |
| `useActivityInfinite`      | `{ ..., pages, fetchNextPage }`                                      |
| `useActivitySubscription`  | `{ isConnected, error }`                                             |
| `useRecordActivity`        | `{ mutate, mutateAsync, isPending, error, data, reset }`             |
| `useActivityContext`       | Provider config (escape hatch)                                       |

### Components

| Component        | Props                              |
| ---------------- | ---------------------------------- |
| `ActivityProvider` | `fetcher`, `recordFn`, `subscribe`, `defaultLimit`, `staleTime`, `activity` |
| `ActivityFeed`   | All `useActivity` options + `children` render-prop |
| `ActivityItem`   | `record`, `formatters?`, `now?`, `children` render-prop |

### Type helpers

`InferActivity`, `InferRecord`, `InferEntities`, `InferEntityName`, `InferAction`, `InferMetadata`

### Utilities

`defineFormatters`, `defaultFormatters`, `formatRelativeTime`, `groupActivity`, `resolveFormatter`, `activityQueryKey`, `normalizeQuery`, `matchesQuery`

## License

MIT.

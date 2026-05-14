# Changelog

## 0.1.0 — 2026-05-14

Initial release.

### Features

- `useActivity` — paginated activity feed with built-in cache and dedup
- `useActivityInfinite` — infinite scroll variant
- `useRecordActivity` — optimistic mutations with automatic rollback on error
- `useActivitySubscription` — real-time event bridge (SSE, WebSocket, etc.)
- `ActivityProvider` — configure fetcher, recordFn, and subscribe once at the root
- Headless components: `<ActivityFeed>` and `<ActivityItem>` (render-prop)
- `defineFormatters` — per-entity, per-action formatter maps
- `InferActivity`, `InferAction`, `InferMetadata` type helpers
- Optional adapters: `./tanstack` (TanStack Query) and `./swr` (SWR)
- Zero runtime dependency on `better-activity` core (types only)

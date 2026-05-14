# Changelog

## 0.1.0 — 2026-05-14

Initial release.

### Features

- `betterActivity()` factory with full TypeScript inference — per-entity action and metadata types
- `defineEntity()` helper for reusable entity configs
- `save()`, `saveMany()`, `list()`, `paginate()`, `byActor()`, `between()`, `count()`, `purge()`
- Cursor-based pagination stable under concurrent inserts
- In-process `subscribe()` for real-time fan-out
- `beforeSave` / `afterSave` hooks; `ctx.abort` to cancel a save
- PII redaction via `redact: [...]` dot-paths
- `strict` mode — rejects unknown entities and actions at runtime
- `disabled` mode — skips writes (dry-run / CI)
- Custom `generateId` support
- **Adapters:** `memory`, `postgres` (`pg`), `mysql` (`mysql2`), `sqlite` (`better-sqlite3`), `mongodb`, `drizzle-orm`, `prisma`, `kysely`
- `createAdapterFactory` for custom adapters
- CLI: `schema`, `generate`, `migrate` commands

# Adding a Database Migration

## Purpose

Use this guide to change the Postgres database schema and generate the matching Drizzle migration files.

Don't Forget has one Postgres database with two table groups:

- **directory tables** (server-side only) for Users, Households, Memberships, and Invitations;
- **product tables** (published to PowerSync) for Lists, Items, and `item_checks`, partitioned by `household_id`.

Adding or changing a **synced product table** has three coordinated edit points: the Postgres schema, the PowerSync publication + `infra/powersync/sync-config.yaml`, and the declarative client schema (`src/client/session/powersync/schema.ts`). The client runs no migrations.

## Before you start

Read:

- `CONTEXT.md` for the data model and domain language.
- `docs/adr/0018-single-postgres-self-hosted-powersync.md` for the Postgres + PowerSync architecture, and `docs/adr/0017-directory-database-on-postgres-single-schema-and-concurrency.md` for the directory schema.
- `docs/how-things-work/environments.md` for `APP_ENV`, production confirmation, and environment isolation.
- `docs/how-things-work/commands.md` for Make targets.
- `docs/code-standards/architecture.md` for data-boundary rules.

Inspect the current schema and migration setup:

- `src/server/db/schema/postgres/directory.ts`
- `src/server/db/schema/postgres/product.ts`
- `src/server/db/drizzle/postgres.config.ts`
- `src/server/db/generate.ts`
- `src/server/db/migrate.ts`
- `src/server/db/migrations.test.ts`
- `infra/powersync/sync-config.yaml` and `src/client/session/powersync/schema.ts` (for synced product tables)

## Files and naming

Directory table schema lives in:

```text
src/server/db/schema/postgres/directory.ts
```

Product table schema lives in:

```text
src/server/db/schema/postgres/product.ts
```

Generated migrations live in:

```text
src/server/db/migrations/postgres/
```

The Drizzle config lives in:

```text
src/server/db/drizzle/postgres.config.ts
```

## Recipe

1. **Choose the correct schema file.**
   - Users, Households, Memberships, and Invitations belong in `src/server/db/schema/postgres/directory.ts`.
   - Lists, Items, `item_checks`, and other product data belong in `src/server/db/schema/postgres/product.ts`.
   - Keep product rows addressable by `household_id` so PowerSync can scope them by Membership.

2. **Make the smallest backward-compatible schema change.**
   - Prefer additive changes.
   - New columns should usually have safe defaults or tolerate older rows.
   - Avoid renames and drops in one step. Use a two-phase rollout when old app versions may still be running.
   - Preserve tombstone columns for replicated data.
   - Keep checked state in `item_checks` (one shared row per Item, keyed `UNIQUE(item_id)` with `checked_by_user_id`); do not move it onto `items`. See ADR-0015.

3. **Update inferred types only through Drizzle schema.**
   - Keep `$inferSelect` and `$inferInsert` exports aligned with table definitions.
   - Do not create duplicate hand-written database row types unless a service needs a separate domain type.

4. **Generate migrations.**

   ```bash
   make db-generate
   ```

   This runs `src/server/db/generate.ts`, which runs drizzle-kit against `src/server/db/drizzle/postgres.config.ts`. The PowerSync publication migration (`src/server/db/migrations/postgres/0001_powersync_publication.sql`) is hand-maintained, since drizzle-kit does not emit `CREATE PUBLICATION`.

5. **Inspect generated SQL and metadata.**
   - Confirm the migration appears under the expected partition directory.
   - Confirm Drizzle did not generate destructive SQL unexpectedly.
   - Confirm `_journal.json` and snapshot metadata changed consistently.
   - The Postgres schema is migrated server-side and is the schema authority; the client uses declarative PowerSync views (`src/client/session/powersync/schema.ts`) and runs no client migrations.

6. **Update migration tests when the schema contract changes.**
   - `src/server/db/migrations.test.ts` should continue proving the Postgres migrations apply to an isolated local database (PGlite).
   - Add focused expectations for new required columns, relationships, indexes, or defaults when useful.

7. **Update services/tests that depend on the schema.**
   - Domain service tests should prove behavior against the new schema.
   - Do not update UI to import database clients or raw schema details.

8. **Apply migrations only when intentionally operating on a configured environment.**
   - Local/staging/production application is a separate operational step from generation.
   - Production requires explicit confirmation.
   - Migrate the Postgres database before running app code built against the new schema. Clients hold no schema of their own — PowerSync client tables are declarative views over synced rows — so there is no staleness gate and no per-device migration to heal.
   - When parallel branches each carry a migration, run them one at a time: per-worktree Postgres isolation is not yet supported (see `docs/how-things-work/environments.md`).

   ```bash
   make db-migrate APP_ENV=staging
   make db-migrate APP_ENV=production CONFIRM_APP_ENV=production
   ```

## Tests and verification

Focused migration proof:

```bash
pnpm exec jest --runInBand --runTestsByPath src/server/db/migrations.test.ts
```

If service behavior changes, run the focused service tests too:

```bash
pnpm exec jest --runInBand --runTestsByPath src/client/features/list/list-service.test.ts
pnpm exec jest --runInBand --runTestsByPath src/server/households/household-service.test.ts
```

Before handoff:

```bash
make format
make verify
```

## Review checklist

- Schema change is in the correct directory or product schema file.
- Change is backward-compatible with the previous shipped app version.
- A synced product-table change updates the PowerSync publication and `sync-config.yaml`.
- Generated SQL and Drizzle metadata were inspected.
- The declarative client schema (`src/client/session/powersync/schema.ts`) matches any synced product-table change.
- Production migration commands are not run unless explicitly intended.
- Tests cover the changed schema behavior.
- `make format` and `make verify` pass.

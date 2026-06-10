# Adding a Database Migration

## Purpose

Use this guide to change the directory or Household database schema and generate the matching Drizzle migration files.

Don't Forget has two database partitions:

- the **directory DB** for Users, Households, Memberships, and Invitations;
- one **Household DB per Household** for Lists, Items, and `item_checks`.

Every schema change must respect that split.

## Before you start

Read:

- `CONTEXT.md` for the data model and domain language.
- `docs/adr/0003-schema-migration-fanout.md` for directory + Household migration fanout.
- `docs/how-things-work/environments.md` for `APP_ENV`, production confirmation, and environment isolation.
- `docs/how-things-work/commands.md` for Make targets.
- `docs/code-standards/architecture.md` for data-boundary rules.

Inspect the current schema and migration setup:

- `db/schema/directory.ts`
- `db/schema/household.ts`
- `db/drizzle/directory.config.ts`
- `db/drizzle/household.config.ts`
- `db/generate.ts`
- `db/migrate.ts`
- `db/household-migrations.ts`
- `db/migrations.test.ts`

## Files and naming

Directory DB schema lives in:

```text
db/schema/directory.ts
```

Household DB schema lives in:

```text
db/schema/household.ts
```

Generated migrations live in:

```text
db/migrations/directory/
db/migrations/household/
```

Drizzle configs live in:

```text
db/drizzle/directory.config.ts
db/drizzle/household.config.ts
```

## Recipe

1. **Choose the correct schema file.**
   - Users, Households, Memberships, and Invitations belong in `db/schema/directory.ts`.
   - Lists, Items, `item_checks`, and other replicated Household data belong in `db/schema/household.ts`.
   - Do not create cross-Household joins or schema dependencies.

2. **Make the smallest backward-compatible schema change.**
   - Prefer additive changes.
   - New columns should usually have safe defaults or tolerate older rows.
   - Avoid renames and drops in one step. Use a two-phase rollout when old app versions may still be running.
   - Preserve tombstone columns for replicated data.
   - Keep checked state in `item_checks`; do not move it onto `items`.

3. **Update inferred types only through Drizzle schema.**
   - Keep `$inferSelect` and `$inferInsert` exports aligned with table definitions.
   - Do not create duplicate hand-written database row types unless a service needs a separate domain type.

4. **Generate migrations.**

   ```bash
   make db-generate
   ```

   This runs `db/generate.ts`, which discovers each `db/drizzle/*.config.ts` file and runs drizzle-kit for both partitions.

5. **Inspect generated SQL and metadata.**
   - Confirm the migration appears under the expected partition directory.
   - Confirm Drizzle did not generate destructive SQL unexpectedly.
   - Confirm `_journal.json` and snapshot metadata changed consistently.
   - For Household schema changes, remember the server-migrated Turso Household DB remains the schema authority; the app does not run bundled local Household migrations.

6. **Update migration tests when the schema contract changes.**
   - `db/migrations.test.ts` should continue proving both directory and Household migrations apply to isolated local DBs.
   - Add focused expectations for new required columns, relationships, indexes, or defaults when useful.

7. **Update services/tests that depend on the schema.**
   - Domain service tests should prove behavior against the new schema.
   - Do not update UI to import database clients or raw schema details.

8. **Apply migrations only when intentionally operating on a configured environment.**
   - Local/staging/production application is a separate operational step from generation.
   - Production requires explicit confirmation.
   - Migrate the remote databases before running app code built against the new schema. Existing devices heal at session open: the schema staleness gate awaits one sync when the local replica is behind the app's bundled journal (`docs/adr/0013-household-schema-staleness-gate.md`).
   - When parallel branches each carry a migration, isolate this worktree's databases first with `make worktree-db` (see `docs/how-things-work/environments.md`).

   ```bash
   make db-migrate APP_ENV=staging
   make db-migrate APP_ENV=production CONFIRM_APP_ENV=production
   ```

## Tests and verification

Focused migration proof:

```bash
pnpm exec jest --runInBand --runTestsByPath db/migrations.test.ts
```

If service behavior changes, run the focused service tests too:

```bash
pnpm exec jest --runInBand --runTestsByPath lib/services/<domain>/<domain>-service.test.ts
```

Before handoff:

```bash
make format
make verify
```

## Review checklist

- Schema change is in the correct directory or Household schema file.
- Change is backward-compatible with the previous shipped app version.
- Household schema change does not assume app-bundled local migrations.
- Generated SQL and Drizzle metadata were inspected.
- Directory and Household migrations are not mixed accidentally.
- Production migration commands are not run unless explicitly intended.
- Tests cover the changed schema behavior.
- `make format` and `make verify` pass.

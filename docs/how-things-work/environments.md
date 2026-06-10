# Environments

Don't Forget has four operational environments selected by `APP_ENV`: `local`, `test`, `staging`, and `production`.

## Environment Meanings

| Environment | Meaning |
| --- | --- |
| `local` | Per-developer app development. Uses real Turso through a private local group so sync and token behavior can be exercised. |
| `test` | Automated tests only. Uses temp file-backed libSQL databases from checked-in migrations and mocked external SDK boundaries. |
| `staging` | Persistent pre-production environment for real device and TestFlight-style validation. Treated as production-like and durable. |
| `production` | Live App Store environment and live user data. |

Do not use `NODE_ENV`, `__DEV__`, or EAS profile names as the source of truth for backend selection. Those values describe tooling or build mode; `APP_ENV` describes the backend and data boundary.

## Turso

Persistent Turso resources are isolated by environment group and redundant database naming:

- Turso group: `dont-forget-<env>` for persistent shared environments, with per-developer local groups such as `dont-forget-local-<name>`.
- Directory DB: `dont-forget-<env>-directory`.
- Household DBs: `df-<env>-hh-<compact-household-id>` so names stay within Turso's 51-character database-name limit.

The Turso group represents the app environment, not the data type. There is no nested `household` group; each environment group contains that environment's directory DB and all of its Household DBs. Household DB names are based on generated Household IDs, not Household names, so they remain stable and avoid personal information.

## Secrets

Each selected environment uses the same secret names, for example `TURSO_DIRECTORY_URL`, `TURSO_ORG`, `CLERK_SECRET_KEY`, and `RESEND_API_KEY`. Do not load all environments into one process with suffixed names such as `TURSO_DIRECTORY_URL_PRODUCTION`.

Production secrets must only be present in production operator contexts. Staging and local commands should fail rather than silently falling back to production values.

Fresh git worktrees do not include ignored env files. For local QA, create a
worktree env file from a trusted local checkout instead of committing secrets:

```bash
make worktree-env
```

The helper symlinks the first `.env.local` it finds in another git worktree. Use
`WORKTREE_ENV_FILE=/path/to/.env.local` to choose a specific source, or
`WORKTREE_ENV_MODE=copy` when a symlink is not appropriate.

### Local API base URL is derived, not configured

In `local` builds the app's API routes are served by the same Expo dev server
that bundles the JS, so the client derives its API base URL from
`expoConfig.hostUri` at runtime instead of reading
`EXPO_PUBLIC_API_BASE_URL` (which local no longer requires). A worktree
running Metro on a non-default port therefore cannot silently call another
checkout's server, and physical devices reach the host machine through the
LAN address they loaded the bundle from. Deployed builds (staging,
production) still configure `EXPO_PUBLIC_API_BASE_URL`. `PUBLIC_APP_BASE_URL`
(server-side links) remains env-configured for now.

### Per-worktree database isolation

All worktrees share the local environment's databases by default. That is safe
for migration-free branches, but parallel efforts that each carry a Household
or directory migration must not share databases: Drizzle applies migrations by
latest `created_at`, so divergent migration sets from two branches either
union onto the shared DBs or get silently skipped (see
`docs/adr/0013-household-schema-staleness-gate.md`).

Give a migration-bearing worktree its own directory DB:

```bash
make worktree-db
```

This creates `df-local-wt-<worktree>-dir` in the existing local group, migrates
it, converts a symlinked `.env.local` into a private copy, and rewrites
`TURSO_DIRECTORY_URL`/`TURSO_DIRECTORY_AUTH_TOKEN` (originals kept as
comments). Create fresh accounts in that worktree; their Households provision
into isolated Household DBs and local replicas. The minted directory token
expires after 30 days; for a worktree that lives longer, destroy and recreate
the worktree DB.

Tear it down when the branch is done:

```bash
make worktree-db-destroy
```

This deletes the worktree directory DB plus every Household DB it recorded and
restores the original `.env.local` values. It refuses to run against databases
not named `df-local-wt-*`.

## Clerk

Clerk only exposes development and production environments. Production uses Clerk production keys. `local`, `test`, and `staging` use Clerk development keys.

Config validation should enforce this split so production never boots with development Clerk keys, and non-production never boots with production Clerk keys.

## Email

Production sends real invitation email through the production Resend sender/domain.

Non-production email must be safe by default: staging uses an obvious staging sender plus recipient allowlisting, local logs email or sends only when explicitly enabled, and automated tests mock email entirely.

## Analytics And Logs

PostHog analytics and logs are tagged with `APP_ENV`. Do not derive analytics/log environments from `__DEV__`, because staging release builds are not development builds and must not be tagged as production.

## API Hosts

App builds point at one API base URL for their selected environment. Local can use a simulator-safe local URL or tunnel; staging and production use separate hosted API deployments/domains.

`EXPO_PUBLIC_API_BASE_URL` is required for `local`, `staging`, and `production` app builds. `test` may omit it because tests mock app/API boundaries directly.

## iOS App Identity

Staging is a separately installable iOS app with a distinct bundle identifier and visible app name suffix. Production keeps the final bundle identifier and app name. Local development can use a development suffix when needed.

## Migrations

Database migrations require an explicit `APP_ENV`:

```bash
make db-migrate APP_ENV=staging
make db-migrate APP_ENV=production CONFIRM_APP_ENV=production
```

Production migrations also require the extra non-interactive confirmation shown above. Keep `CONFIRM_APP_ENV=production` out of `.env.production`; it should be an operator action at the time the command is run.

## Database Reset

Database reset deletes app data from the selected environment's directory DB and every Household DB known from directory rows. It preserves migration metadata tables.

```bash
make db-reset APP_ENV=local CONFIRM_DB_RESET=local
make db-reset APP_ENV=staging CONFIRM_DB_RESET=staging
make db-reset APP_ENV=production CONFIRM_DB_RESET=production CONFIRM_APP_ENV=production
```

`CONFIRM_DB_RESET` must match `APP_ENV` for every reset. Production also requires `CONFIRM_APP_ENV=production`.

Tests must not call the real migration command. They use local temp databases loaded from `db/migrations/**` through test helpers.

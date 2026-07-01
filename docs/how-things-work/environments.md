# Environments

Don't Forget has four operational environments selected by `APP_ENV`: `local`, `test`, `staging`, and `production`.

## Environment Meanings

| Environment | Meaning |
| --- | --- |
| `local` | Per-developer app development. Runs against a local Postgres + self-hosted PowerSync stack so sync behavior can be exercised. |
| `test` | Automated tests only. Uses ephemeral local databases (PGlite for the Postgres directory, in-memory SQLite for the PowerSync-backed product schema) and mocked external SDK boundaries. |
| `staging` | Persistent pre-production environment for real device and TestFlight-style validation. Treated as production-like and durable. |
| `production` | Live App Store environment and live user data. |

Do not use `NODE_ENV`, `__DEV__`, or EAS profile names as the source of truth for backend selection. Those values describe tooling or build mode; `APP_ENV` describes the backend and data boundary.

## Data Store

Each environment has one Postgres database (holding both the directory and product data) fronted by a self-hosted PowerSync service; there are no per-Household databases.

- Postgres: addressed by `DATABASE_URL`, reachable only on the environment's private Docker network.
- PowerSync service: addressed by `EXPO_PUBLIC_POWERSYNC_URL`; it streams rows to devices scoped by Membership.
- Writes: the client uploads local changes to the `/api/data` endpoint on the environment's API host (`EXPO_PUBLIC_API_BASE_URL`).

The Postgres database holds every Household's Lists, Items, and `item_checks` in shared tables partitioned by `household_id`, alongside the directory tables (Users, Households, Memberships, Invitations, Household Join Codes).

## Secrets

Each selected environment uses the same secret names, for example `DATABASE_URL`, `CLERK_SECRET_KEY`, and `RESEND_API_KEY`. Do not load all environments into one process with suffixed names such as `DATABASE_URL_PRODUCTION`.

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
that bundles the JS, so the client derives its API base URL at runtime from the dev-server URL the
bundle actually loaded from (scheme included, so HTTPS tunnel origins work)
instead of reading `EXPO_PUBLIC_API_BASE_URL` (which local no longer
requires). A worktree
running Metro on a non-default port therefore cannot silently call another
checkout's server, and physical devices reach the host machine through the
address they loaded the bundle from. Deployed builds (staging,
production) still configure `EXPO_PUBLIC_API_BASE_URL`. `PUBLIC_APP_BASE_URL`
(server-side links) remains env-configured for now.

### Per-worktree database isolation

All worktrees share the local environment's single Postgres database by
default. That is safe for migration-free branches, but two branches that each
carry a divergent migration set should not share one database.

Real per-worktree Postgres isolation is **not yet supported**: the
`make worktree-db` / `make worktree-db-destroy` targets predate the PowerSync
cut-over and currently error. Isolated-DB worktrees are a forthcoming DX task
tied to the self-host deploy work (PR-E). Until then, run migration-bearing
branches one at a time against the shared local Postgres, or point a worktree at
a separate `DATABASE_URL` by hand.

The email-backed local seed flow still works against the shared local Postgres.
Passing `EMAIL=<address>` to `make db-seed`/`make db-reseed` creates email-scoped
local Clerk development Users for Owner and plain Member sign-in; if those Clerk
development Users already exist, the seed flow reuses them, resets them to the
local seed password, marks their primary email addresses verified through the
Clerk backend API, and disables their MFA methods so fake local emails never
require an inbox-backed sign-in code. Email-backed List and Item fixture IDs are
scoped from the EMAIL value, while deterministic seed fixtures keep stable IDs so
duplicate deterministic seed data is caught intentionally. When
`db-seed EMAIL=<address>` is rerun for an EMAIL whose local seed rows already
exist, the Clerk development Users are repaired before the duplicate seed-data
check refuses to insert another copy.

## Clerk

Clerk only exposes development and production environments. Production uses Clerk production keys. `local`, `test`, and `staging` use Clerk development keys.

Config validation should enforce this split so production never boots with development Clerk keys, and non-production never boots with production Clerk keys.

Local email-backed seed sign-in relies on normal Clerk email/password sessions,
so the local Clerk development application should keep Client Trust and Bot
sign-up protection disabled. If staging needs production-like auth hardening,
use a separate Clerk development application for staging instead of sharing the
local Clerk application.

## Email

Production sends real invitation email through the production Resend sender/domain.

Non-production email must be safe by default: staging uses an obvious staging sender plus recipient allowlisting, local logs email or sends only when explicitly enabled, and automated tests mock email entirely.

## Analytics And Logs

PostHog analytics and logs are tagged with `APP_ENV`. Do not derive analytics/log environments from `__DEV__`, because staging release builds are not development builds and must not be tagged as production.

## API Hosts

App builds point at one API base URL for their selected environment. Local derives it at runtime from the Expo dev server that served the bundle (see "Local API base URL is derived, not configured" above); staging and production use separate hosted API deployments/domains.

`EXPO_PUBLIC_API_BASE_URL` is required for `staging` and `production` app builds. `local` ignores it in favor of the dev-server derivation, and `test` may omit it because tests mock app/API boundaries directly.

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

Database reset deletes app data from the selected environment's Postgres database (directory and product tables). It preserves migration metadata tables.

```bash
make db-reset APP_ENV=local CONFIRM_DB_RESET=local
make db-reset APP_ENV=staging CONFIRM_DB_RESET=staging
make db-reset APP_ENV=production CONFIRM_DB_RESET=production CONFIRM_APP_ENV=production
```

`CONFIRM_DB_RESET` must match `APP_ENV` for every reset. Production also requires `CONFIRM_APP_ENV=production`.

Tests must not call the real migration command. They use local temp databases loaded from `db/migrations/**` through test helpers.

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

For `APP_ENV=local`, the same helper also creates an ignored `.env.worktree`
regular file. It contains only generated checkout-local values:

- `API_PORT`
- `WEB_PORT`
- `PUBLIC_WEB_BASE_URL=http://localhost:<WEB_PORT>`

The effective local precedence is already-exported process env, then
`.env.worktree`, then `.env.local`. `test`, `staging`, and `production` do not
load `.env.worktree`; they load only `.env.<APP_ENV>`. The standalone API
composition root still calls dotenv only for local, so staging/production
containers remain process-env-only.

### Local API base URL is derived, not configured

In `local` builds the client derives scheme and host at runtime from the Metro
dev-server URL that loaded the bundle, then replaces only the port with
`extra.apiPort` baked by `app.config.ts` from the effective `API_PORT`. A
worktree running Metro on a non-default `PORT` therefore still calls its own
standalone API process, and physical devices keep using the host they loaded
the bundle from.

Deployed builds (`staging`, `production`) still configure
`EXPO_PUBLIC_API_BASE_URL`. `PUBLIC_WEB_BASE_URL` is server-side link-generation
configuration and a deployed mobile build input; locally it is generated in
`.env.worktree` from the same checkout-local `WEB_PORT`.

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

The direct `make db-seed` and `make db-reseed` workflows remain local-only.
Staging has one separate, additive QA-fixture command:

```bash
printf "Staging seed Owner email: "
IFS= read -r -s STAGING_SEED_EMAIL
printf "\n"
EMAIL="$STAGING_SEED_EMAIL" make infra-seed APP_ENV=staging
unset STAGING_SEED_EMAIL
```

`infra-seed` invokes `packages/db/scripts/seed.ts` in a disposable
`tools`-profile container on staging's private database network. It requires
EMAIL-backed mode, the explicit staging environment, and the exact staging
confirmation supplied by the staging-only Compose service. Its process receives
only those two policy values plus the database URL, Clerk secret, and
purpose-created Owner email needed for the run. Production Compose has no seed
service, and `test` and `production` are rejected by the source policy before
Clerk or database clients are created.

Compose defaults an unset staging seed `EMAIL` to blank so interpolation of the
inactive tools profile does not break ordinary staging operations. The
`infra-seed` Make target rejects blank input before invoking Compose, and the
source policy independently interprets blank input as deterministic mode and
refuses that mode in staging. Direct Compose execution without an email is
therefore also fail-closed.

This exception does not make durable staging a resettable seed sandbox. It does
not run a reset/reseed, deploy or restart services, or touch volumes. Staging
logs only safe fixture IDs, row counts, and created/reused Clerk status for
exact cleanup; it never logs the email, shared password, Household Join Code
value, Invitation token, raw error, or environment contents. All persisted
fixture rows use one transaction, so a later product-row failure rolls them all
back before newly-created Clerk Users are cleaned up; reused Clerk Users are
preserved.

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

App builds point at one API base URL for their selected environment. Local
derives the scheme/host from the Metro dev server and the port from
`extra.apiPort` (see "Local API base URL is derived, not configured" above);
staging and production use separate hosted API deployments/domains.

`EXPO_PUBLIC_API_BASE_URL` is required for `staging` and `production` app builds. `local` ignores it in favor of the dev-server derivation, and `test` may omit it because tests mock app and API boundaries directly.

### Deployed external origins and iOS universal links

Operators configure deployed mobile builds with three distinct external
origins. The public hostnames are protected operator configuration and are not
committed to the repository.

| Role | Configuration | Ownership |
| --- | --- | --- |
| API | `EXPO_PUBLIC_API_BASE_URL` | Machine-facing `/api/*` routes and `/health` |
| Web | `PUBLIC_WEB_BASE_URL` | The AASA document plus the Invitation accept and Household Join Code join browser documents |
| PowerSync | `EXPO_PUBLIC_POWERSYNC_URL` | Device sync transport |

`PUBLIC_WEB_BASE_URL` remains the API's link-generation input. For staging and
production it is also a build-time-only mobile input used to derive the single
iOS Associated Domains entitlement. It is not an `EXPO_PUBLIC_*` runtime field
and is not copied into Expo `extra`.

The mobile entitlement reader requires `PUBLIC_WEB_BASE_URL` to be an HTTPS
origin without credentials, an explicit port, path, query, or fragment, and it
requires the normalized web origin to differ from the API origin. The existing
API runtime parser remains path-tolerant and unchanged; it does not enforce
these mobile build constraints.

Local and test builds omit the Associated Domains entitlement and use their
environment-specific custom schemes. Physical staging QA uses the `preview`
EAS profile because it is the internal-distribution profile with
`APP_ENV=staging`; the `staging` profile is not the internal-distribution
profile.

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

Tests must not call the real migration command. They use local temp databases loaded from `packages/db/src/migrations/**` through helpers exported by `@dont-forget/db/test`.

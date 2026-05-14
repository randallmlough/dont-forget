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
- Household DBs: `dont-forget-<env>-household-<household-id-suffix>`.

The Turso group represents the app environment, not the data type. There is no nested `household` group; each environment group contains that environment's directory DB and all of its Household DBs. Household DB names are based on generated Household IDs, not Household names, so they remain stable and avoid personal information.

## Secrets

Each selected environment uses the same secret names, for example `TURSO_DIRECTORY_URL`, `TURSO_ORG`, `CLERK_SECRET_KEY`, and `RESEND_API_KEY`. Do not load all environments into one process with suffixed names such as `TURSO_DIRECTORY_URL_PRODUCTION`.

Production secrets must only be present in production operator contexts. Staging and local commands should fail rather than silently falling back to production values.

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

## iOS App Identity

Staging is a separately installable iOS app with a distinct bundle identifier and visible app name suffix. Production keeps the final bundle identifier and app name. Local development can use a development suffix when needed.

## Migrations

Database migrations require an explicit `APP_ENV`:

```bash
make db-migrate APP_ENV=staging
make db-migrate APP_ENV=production CONFIRM_APP_ENV=production
```

Production migrations also require the extra non-interactive confirmation shown above. Keep `CONFIRM_APP_ENV=production` out of `.env.production`; it should be an operator action at the time the command is run.

Tests must not call the real migration command. They use local temp databases loaded from `db/migrations/**` through test helpers.

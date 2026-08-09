# Operational environments are explicit and isolated

_Amended 2026-06-30 ([ADR-0018](0018-single-postgres-self-hosted-powersync.md)): the per-environment data store is now a single Postgres + self-hosted PowerSync, not per-Household Turso. The `APP_ENV` isolation principle, the one-environment-per-process secrets rule, and the Clerk development/production exception are unchanged._

_Amended 2026-08-09: infrastructure selection and production confirmation are now enforced at the Make/operator entrypoints. `APP_ENV` selects the checked-in Compose file and matching `.env.<environment>` file; ambient `COMPOSE_FILE` does not select topology._

Don't Forget uses an explicit `APP_ENV` selector with `local`, `test`, `staging`, and `production` values instead of inferring backend targets from `NODE_ENV`, `__DEV__`, or build profile names. Persistent environments use a single environment-scoped Postgres database (`DATABASE_URL`) fronted by a self-hosted PowerSync service (`EXPO_PUBLIC_POWERSYNC_URL`), env-specific API hosts, separate iOS app identities for staging and production, production-only real email delivery, and PostHog analytics/log tags derived from `APP_ENV`; automated tests remain ephemeral local databases (PGlite for the Postgres directory, in-memory SQLite for the PowerSync-backed product schema) and mocked external boundaries. Clerk is the deliberate exception: production uses Clerk production keys, while every non-production environment uses Clerk development keys, enforced by config validation because Clerk only exposes development and production environments.

## Consequences

- Migration and provisioning code must load exactly one environment at a time and must not keep staging and production secrets in the same process under suffixed variable names.
- `make infra-migrate` and `make infra-deploy` accept only staging or production. Production additionally requires `CONFIRM_APP_ENV=production`; direct DB migration/reset entrypoints enforce the same environment confirmation, and `make infra-destroy APP_ENV=production` refuses to run.
- Make maps `APP_ENV=local`, `staging`, and `production` to `infra/docker-compose.yaml`, `infra/compose.staging.yaml`, and `infra/compose.production.yaml` respectively, always with the matching `.env.<environment>` file.
- Staging is production-like and durable; it is not a resettable seed sandbox.
- Local app development runs against a local Postgres + self-hosted PowerSync stack so sync behavior can be exercised; automated tests continue to use isolated, ephemeral local databases.

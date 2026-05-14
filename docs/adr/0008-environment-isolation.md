# Operational environments are explicit and isolated

Don't Forget uses an explicit `APP_ENV` selector with `local`, `test`, `staging`, and `production` values instead of inferring backend targets from `NODE_ENV`, `__DEV__`, or build profile names. Persistent environments use environment-scoped Turso groups, env-prefixed database names, env-specific API hosts, separate iOS app identities for staging and production, production-only real email delivery, and PostHog analytics/log tags derived from `APP_ENV`; automated tests remain ephemeral file-backed libSQL and mocked external boundaries. Clerk is the deliberate exception: production uses Clerk production keys, while every non-production environment uses Clerk development keys, enforced by config validation because Clerk only exposes development and production environments.

## Consequences

- Migration and provisioning code must load exactly one environment at a time and must not keep staging and production secrets in the same process under suffixed variable names.
- Production migrations require explicit non-interactive confirmation in addition to `APP_ENV=production`.
- Staging is production-like and durable; it is not a resettable seed sandbox.
- Local app development uses real Turso through a per-developer local group so sync and token behavior can be exercised; automated tests continue to use isolated local libSQL files.

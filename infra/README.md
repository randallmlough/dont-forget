# Infrastructure

The local development stack uses `docker-compose.yaml`. It publishes ports for
development only. Staging uses `compose.staging.yaml` on the homelab at
`~/docker/dont-forget/`. It publishes no ports; Cloudflare Tunnel reaches the
web-facing containers over the external `proxy-net` network.

## First staging deploy

Run on the server:

```sh
ssh homelab
git clone <repo-url> ~/docker/dont-forget
cd ~/docker/dont-forget
# Create .env.staging (never commit it) with COMPOSE_FILE=infra/compose.staging.yaml and all
# Postgres/PowerSync, Clerk, Resend, and PostHog variables from infra/.env.example.
# Postgres/PowerSync connection URIs are assembled inside compose.staging.yaml
# from the PG_* variables — the env file holds only user/name/password parts.
make infra-deploy APP_ENV=staging
```

The `make infra-*` targets read `.env.$(APP_ENV)` from the repo root (default
`local`), and that env file's `COMPOSE_FILE` selects the compose file — the
Makefile hardcodes neither. `infra-deploy` chains `infra-build`, `infra-up`,
and `infra-migrate` (the one-off migrate container from the `tools` profile);
each is also runnable on its own.

The migration command applies the Drizzle schema and PowerSync publication.
The API image exports the web server bundle with
`pnpm expo export --platform web --no-ssg`; web UI rendering is intentionally
disabled because this deployment serves API routes only. The public Invitation
and Household Join Code links built from `PUBLIC_APP_BASE_URL` therefore get
minimal open-in-the-app fallback pages from `server.mjs` instead of web screens.

## Tunnel and authentication

In the Cloudflare dashboard, add two public hostnames to the `homelab` tunnel:

- API: `dontforget-api:8080`
- PowerSync: `dontforget-powersync:<PS_PORT>`

Do not add a Cloudflare Access policy to either hostname; Clerk owns
authentication. Use the resulting public HTTPS URLs for
`EXPO_PUBLIC_API_BASE_URL`, `PUBLIC_APP_BASE_URL`, and
`EXPO_PUBLIC_POWERSYNC_URL` in the server `.env.staging` build arguments and the EAS
`preview` environment used by staging iOS builds.

## Redeploy

```sh
git pull
make infra-deploy APP_ENV=staging
```

Staging is deliberately wipeable with `make infra-destroy APP_ENV=staging`. Its named
volumes and non-`-db` container names keep it outside homelab backups. Run
`make infra-deploy APP_ENV=staging` again after a wipe.

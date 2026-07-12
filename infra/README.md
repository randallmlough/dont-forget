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
cd ~/docker/dont-forget/infra
# Create .env (never commit it) with COMPOSE_FILE=compose.staging.yaml and all
# Postgres/PowerSync, Clerk, Resend, and PostHog variables from .env.example.
# DATABASE_URL and PS_DATA_SOURCE_URI use dontforget-pg-source:5432.
# PS_STORAGE_SOURCE_URI uses dontforget-pg-storage:5432.
docker compose build api
docker compose up -d
docker compose --profile tools run --rm migrate
```

The migration command applies the Drizzle schema and PowerSync publication.
The API image exports the web server bundle with
`pnpm expo export --platform web --no-ssg`; web UI rendering is intentionally
disabled because this deployment serves API routes only.

## Tunnel and authentication

In the Cloudflare dashboard, add two public hostnames to the `homelab` tunnel:

- API: `dontforget-api:8080`
- PowerSync: `dontforget-powersync:<PS_PORT>`

Do not add a Cloudflare Access policy to either hostname; Clerk owns
authentication. Use the resulting public HTTPS URLs for
`EXPO_PUBLIC_API_BASE_URL`, `PUBLIC_APP_BASE_URL`, and
`EXPO_PUBLIC_POWERSYNC_URL` in the server `.env` build arguments and the EAS
`preview` environment used by staging iOS builds.

## Redeploy

```sh
git pull
docker compose build api
docker compose up -d api
```

Staging is deliberately wipeable with `docker compose down -v`. Its named
volumes and non-`-db` container names keep it outside homelab backups. Run the
migration command again after a wipe.

# Infrastructure

The local development stack uses `docker-compose.yaml`. It publishes ports for
development only. Staging uses `compose.staging.yaml` on the homelab at
`~/docker/dont-forget/`. It publishes no ports; Cloudflare Tunnel reaches the
API, static web, and PowerSync containers over the external `proxy-net`
network.

The API image builds one verified Node 22 ESM bundle and injects all server
configuration through Compose process environment at runtime. The separate web
image builds the two public link pages and AASA file, then serves only that
static artifact through nginx. The web container has no runtime environment,
secrets, database access, or API dependency. API health is `GET /health` on
port 8080.

## First staging deploy

Run on the server:

```sh
ssh homelab
git clone <repo-url> ~/docker/dont-forget
cd ~/docker/dont-forget
# Create .env.staging (never commit it) with COMPOSE_FILE=infra/compose.staging.yaml and all
# Postgres/PowerSync, Clerk, Resend, PostHog, and public-origin variables from .env.example.
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
`make infra-deploy` builds the API bundle image and static web image
independently before starting the stack. `PUBLIC_WEB_BASE_URL` is runtime API
configuration used to construct public Invitation and Household Join Code
links; it must be the public web origin, never the API origin. The web image
receives only the non-secret `APP_ENV` build argument.

Staging has one narrow QA-fixture path for provisioning a purpose-created
Owner through the package-owned `packages/db/scripts/seed.ts` entrypoint:

```sh
printf "Staging seed Owner email: "
IFS= read -r -s STAGING_SEED_EMAIL
printf "\n"
EMAIL="$STAGING_SEED_EMAIL" make infra-seed APP_ENV=staging
unset STAGING_SEED_EMAIL
```

`infra-seed` requires the explicit staging environment and a nonblank `EMAIL`,
then builds and removes a one-off `tools`-profile container on the private
`internal` network. The staging Compose service supplies the exact staging
environment and confirmation; beyond those policy values, it supplies only the
database URL, Clerk secret, and email required by the seed process. It
publishes no ports and does not recreate or restart the API, web, PowerSync, or
Postgres services.

The Compose service defaults an unset `EMAIL` to blank so inactive-profile
interpolation cannot break ordinary staging operations. Safety remains layered:
the Make target rejects blank input before invoking Compose, and the seed source
treats blank input as deterministic mode, which staging always refuses. Calling
the Compose seed service directly without `EMAIL` therefore still fails closed.

This is not a general staging reset or reseed workflow. Staging remains durable
in routine operation; `make db-seed` and `make db-reseed` remain local-only,
and test/production seeding is forbidden. Production Compose intentionally has
no seed service. A successful staging run prints only a safe cleanup manifest.
If persisted fixture insertion fails, its single transaction rolls back before
the process cleans up only Clerk Users created by that invocation. No reset,
reseed, deployment, restart, or volume operation is implied by `infra-seed`.

## Tunnel and authentication

Choose three distinct public HTTPS origins and map them in Cloudflare Tunnel:

- API origin → `http://dontforget-staging-api:8080`
- web origin → `http://dontforget-staging-web:8080`
- PowerSync origin → `http://dontforget-staging-powersync:<PS_PORT>`

The public hostname values are operator-owned and must not be guessed or
committed. Do not add a Cloudflare Access policy to these hostnames; Clerk owns
application authentication. Set `PUBLIC_WEB_BASE_URL` to the approved web
origin in `.env.staging`. Set `EXPO_PUBLIC_API_BASE_URL` and
`EXPO_PUBLIC_POWERSYNC_URL` to the approved API and PowerSync origins in the EAS
`preview` environment used by staging iOS builds.

## Fresh staging cutover

A fresh cutover destroys the wipeable `dontforget-staging` project and its
named volumes. Before running it, require explicit same-session operator
approval and perform a read-only preflight: the checkout must be the approved
clean commit; `.env.staging` must exist without being printed; Compose must
resolve exactly project `dontforget-staging` with no production/debug override;
and external network `proxy-net` must exist. Confirm the three approved origins
and tunnel mappings above, including `PUBLIC_WEB_BASE_URL=<approved web origin>`.

Only after every preflight check and the destructive approval pass:

```sh
make infra-destroy APP_ENV=staging
make infra-deploy APP_ENV=staging
make infra-ps APP_ENV=staging
```

Verify API `/health`, the web AASA and public pages, PowerSync liveness, route
ownership, and synthetic-marker log privacy. Never run the destroy command
with `APP_ENV=production`; T5 does not authorize a production deploy, restart,
or teardown.

## Redeploy

```sh
git pull
make infra-deploy APP_ENV=staging
```

Staging is deliberately wipeable with `make infra-destroy APP_ENV=staging`. Its named
volumes and non-`-db` container names keep it outside homelab backups. Run
`make infra-deploy APP_ENV=staging` again after a wipe.

## Database GUI access

Staging Postgres publishes no ports. For ad-hoc inspection from a database GUI
(TablePlus etc.), opt into `compose.staging.debug.yaml`, which publishes the
source Postgres on the homelab's loopback only:

```sh
# in .env.staging on the homelab
COMPOSE_FILE=infra/compose.staging.yaml:infra/compose.staging.debug.yaml
```

Run `make infra-up APP_ENV=staging`, then connect through the GUI's SSH tunnel
(SSH host: homelab; database host: `127.0.0.1:5432`; credentials from the
`PG_DATABASE_*` values). Remove the override from `COMPOSE_FILE` and re-run
`make infra-up APP_ENV=staging` to close the port.

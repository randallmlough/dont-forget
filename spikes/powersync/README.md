# PowerSync replatform spike (plan 015)

Throwaway spike proving a single Postgres + PowerSync sync streams can replace the
per-Household Turso DB model. All code here is disposable; the deliverable is the
report: **`REPORT.md`** (verdict + the six decision questions). Engineering log with every
raw measurement, error, and fix: **`NOTES.md`**.

## What's here

```
docker-compose.yaml      4-container stack (self-contained, flattened from the
                         powersync-ja/self-host-demo postgres-bucket-storage demo)
.env                     local-only ports/credentials (throwaway)
init-scripts/            source Postgres schema (mirrors prod) + seed (A/B, H1/H2)
powersync/service.yaml   PowerSync service config (static dev JWKS)
powersync/sync-config.yaml  sync STREAMS (edition 3) — per-user row partitioning
backend/                 minimal Node upload endpoint (LWW + membership authz)
tools/                   dev-token minting + sync-row diagnostics
keys/                    RS256 dev keypair (GITIGNORED — regenerate, see below)
app/                     minimal Expo client (Step 2)
```

## Ports (host)

| Service | Port |
|---|---|
| pg-source (replicated data) | 5499 |
| pg-storage (bucket storage) | 5498 |
| PowerSync API | 8089 |
| Node upload endpoint | 6068 |

## Versions

- PowerSync service: `journeyapps/powersync-service:1.22.0`
- Postgres: `postgres:18`
- Sync streams: edition 3 (GA May 2026)
- Client SDK: `@powersync/react-native` (+ `@powersync/op-sqlite` adapter), `@powersync/react`

## First-time setup: dev keys

> In the Phase-1 worktree the keypair already exists at `keys/` and matches the JWK in
> `powersync/service.yaml`, so the running demo works without this step. These steps are
> only needed on a fresh clone (keys are gitignored).

The RS256 dev keypair is gitignored (never commit private keys). Regenerate it and
re-embed the public JWK before running:

```bash
cd spikes/powersync
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/dev-private.pem
openssl rsa -in keys/dev-private.pem -pubout -out keys/dev-public.pem
(cd tools && pnpm install)            # installs jose
node tools/jwk.mjs                    # prints the public JWK
```

Copy the printed `n` (and confirm `e`, `kid`) into
`powersync/service.yaml` -> `client_auth.jwks.keys[0]`. The committed file already
contains a JWK; if you regenerate keys you MUST update it to match, or tokens will
fail verification.

Then install backend deps (mounted into the container):

```bash
(cd backend && pnpm install)
```

## Run the backend stack

```bash
cd spikes/powersync
docker compose up -d
docker compose ps          # all 4 healthy/up
```

## Verify Step 1 (per-user row partitioning)

```bash
node tools/synced-rows.mjs user-a   # -> households [h1, h2]
node tools/synced-rows.mjs user-b   # -> households [h1]
```

Expected: A receives H1+H2 rows; B receives only H1 rows.

## Run the client (Step 2)

See `app/README` notes. From `spikes/powersync/app`:

```bash
pnpm install
npx expo run:ios --device "<simulator name or udid>"
```

The app has a hardcoded A/B user switcher, renders H1's first List with items and
per-user checks via a reactive query, and writes through the Node endpoint. Long-press
an item to rename it (the crude Q5 conflict affordance).

## Reproduce the decision-question evidence (Phase 2)

```bash
cd spikes/powersync

# Q3 revocation: B stops receiving H1 and B's H1 writes are 403'd.
docker compose exec -T pg-source psql -U postgres -p 5499 -d postgres \
  -c "DELETE FROM memberships WHERE id='m-b-h1';"
node tools/synced-rows.mjs user-b          # -> households [] (B cut off)
# ...then restore so the demo is back to seed:
docker compose exec -T pg-source psql -U postgres -p 5499 -d postgres \
  -c "INSERT INTO memberships (id,household_id,user_id,role,status) VALUES ('m-b-h1','h1','user-b','member','active');"

# Q4 Clerk JWT (needs the main checkout's gitignored .env.local at RUNTIME ONLY):
set -a; source <(grep -E '^(CLERK_SECRET_KEY|EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY)=' \
  ../../.env.local); set +a
node tools/clerk-token-test.mjs            # default token -> PowerSync 401 PSYNC_S2105 (missing aud)
# After creating a Clerk Dashboard JWT template named `powersync` ({"aud":"powersync-dev"}):
node tools/clerk-token-test.mjs http://localhost:8089 powersync   # -> accepted
```

> The Clerk frontend-API domain in `powersync/service.yaml` (`client_auth.jwks_uri`) is
> PUBLIC (derivable from the publishable key); it is not a secret. The publishable/secret
> KEY VALUES are never committed — `tools/clerk-token-test.mjs` reads them from the
> environment at runtime.

## Tear down

```bash
docker compose down          # keep volumes
docker compose down -v       # also drop Postgres data
```

# PowerSync spike — engineering log (Phase 1: Steps 1 & 2)

This log is the Phase 2 agent's primary context besides the plan and the committed
code. It records exact versions, decisions + why, raw measurements, every error and
its fix, dead ends, and which docs pages were relied on.

## Scope of this phase

- Step 1: stand up the backend (single Postgres, sync streams, verify per-user row sets).
- Step 2: minimal Expo client + write path (cross-device propagation, measure latency).
- Steps 3 & 4 (six decision questions + report) are explicitly NOT in this phase.

## Environment (verified by orchestrator + me at start)

- Worktree: `.claude/worktrees/agent-a39b076099694c195`, branch `advisor/015-powersync-spike`.
- `docker info` exits 0. Ports 5499 and 8089 free at start (orchestrator-suggested).
- Booted sim to LEAVE ALONE: iPhone 17 Pro `261F6427-153A-4C7B-8528-E6E8C542E15D`.
- Two OTHER sims to boot for the two-device demo.
- `rocketsim` CLI on PATH; `xcrun simctl` + screenshots is an acceptable fallback.

## Docs relied on (fetched live, 2026-06-11)

- Overview: https://docs.powersync.com/intro/powersync-overview
- RN/Expo SDK: https://docs.powersync.com/client-sdks/reference/react-native-and-expo
- Sync streams (GA May 2026, edition 3): https://docs.powersync.com/usage/sync-streams
- Dev tokens: https://docs.powersync.com/installation/authentication-setup/development-tokens
- Self-host demo repo (canonical compose/config): https://github.com/powersync-ja/self-host-demo
  - Used `demos/nodejs-postgres-bucket-storage/` as the template: Postgres source +
    Postgres bucket storage (no MongoDB needed) + Node backend.

## Key facts discovered from live docs (NOT memory)

- **Service image**: `journeyapps/powersync-service:latest` (will pin a concrete tag).
- **Postgres image**: `postgres:18` in the demo; source DB must run with
  `wal_level=logical` and have a `publication powersync for table ...`.
- **Storage backend**: PowerSync supports Postgres bucket storage (since service 1.3.8)
  via `storage: { type: postgresql, uri: ... }`. Storage MUST be a *separate* Postgres
  DB from the replicated source. This lets us skip MongoDB entirely. Decision: run TWO
  Postgres containers — `pg-source` (replicated, data) and `pg-storage` (bucket storage).
- **Sync streams syntax** (`sync-config.yaml`):
  ```yaml
  config:
    edition: 3
  streams:
    <name>:
      auto_subscribe: true
      queries:
        - SELECT * FROM <table> WHERE <col> = auth.user_id()
  ```
  Membership filtering via subquery: `WHERE household_id IN (SELECT household_id FROM
  memberships WHERE user_id = auth.user_id())`. `auth.user_id()` = JWT `sub` claim.
- **Dev auth**: `client_auth` accepts a static `jwks: { keys: [...] }` block. We mint
  RS256 tokens locally with a private key whose public JWK is embedded in service.yaml.
  Token `sub` = user id; `aud` must be in `client_auth.audience` (use `powersync-dev`).
  This avoids running a JWKS HTTP server.
- **Diagnostics for Step 1 verification**: the powersync-service `test-client` exposes
  `generate-token` and `fetch-operations --raw` (returns the exact operations/rows a
  given token would receive). This is how we prove A gets H1+H2 and B gets only H1
  without writing a client first.
- **Client SDK**: `@powersync/react-native` + a SQLite adapter
  (`@powersync/op-sqlite` + `@op-engineering/op-sqlite`, OR
  `@journeyapps/react-native-quick-sqlite`). `@powersync/react` for hooks.
  Schema: `new Schema({ table: new Table({...}) })`; `id` column is implicit.
  Connector implements `fetchCredentials()` + `uploadData(db)`.

## Port plan (final)

| Service | Container port | Host port | Why |
|---|---|---|---|
| pg-source | 5499 | 5499 | orchestrator-suggested, free |
| pg-storage | 5498 | 5498 | adjacent free port (checked) |
| powersync  | 8089 | 8089 | orchestrator-suggested, free |
| node backend (upload endpoint) | 6068 | 6068 | uncommon, checked |

## Schema decision (Step 1)

Mirror production schema (SQLite/Drizzle) into Postgres, single DB, all Households together:
- `users(id, clerk_user_id, display_name)`
- `households(id, name)`
- `memberships(id, household_id, user_id, role, status)`
- `lists(id, name, household_id, created_by_user_id, created_at, updated_at, archived_at, deleted_at)`
- `items(id, list_id, name, quantity, notes, position, created_by_user_id, created_at, updated_at, deleted_at)`
- `item_checks(item_id, user_id, checked_at, updated_at)` PK(item_id,user_id)

Open question the plan flagged: do sync streams need a direct partition column on every
synced table, or can items/item_checks reach Household via list_id/item_id joins? Will
test empirically and record the answer. (Recorded below once known.)

## Timeline / decisions (append-only)

- [start] Research complete. Building backend from the postgres-bucket-storage template.

### Step 1 — DONE

- Service image pinned: `journeyapps/powersync-service:1.22.0` (latest stable tag
  on Docker Hub 2026-06-11; the "latest" tag also resolved to this). Postgres `postgres:18`.
- Stack: 4 containers (pg-source, pg-storage, powersync, backend). `docker compose up -d`
  brought all to healthy; powersync logs show it replicated all 6 tables and activated
  the replication stream. No MongoDB anywhere — Postgres bucket storage works.
- **Backend container error + fix**: backend crashed ENOENT on `/keys/dev-public.pem`.
  Cause: `./backend` mounts at `/app`, so `../keys` resolved to `/keys` which wasn't
  mounted. Fix: added `- ./keys:/keys:ro` volume to the backend service. One-line fix.
- pnpm-installed `node_modules` (pure-JS `pg` 8.21 + `jose` 5.10) mounted into
  `node:22-alpine` worked without native rebuild — no Dockerfile needed.

- **Dev auth**: static RS256 JWKS embedded in `powersync/service.yaml client_auth.jwks`
  (public n/e from keys/dev-public.pem). Tokens minted by `tools/mint-token.mjs`
  (`sub`=user id, `aud`=powersync-dev, 12h). The service accepted them — verified by
  getting past auth into body validation on /sync/stream.

- **Diagnostics method**: there is no separate diagnostics endpoint; I call the
  documented sync protocol endpoint directly. `POST /sync/stream` with
  `{"streams":{"subscriptions":[],"include_defaults":true},"include_checksum":true,"raw_data":true}`
  and `Authorization: Bearer <devtoken>` streams newline-delimited JSON: a `checkpoint`
  listing buckets, then `data` messages with the rows. `tools/synced-rows.mjs` wraps this
  and summarizes the row set per user. Body-shape discovery was iterative (the validator
  guided me: `streams` must be an object, must have `subscriptions`).

- **VERIFICATION (Step 1 acceptance) — PASS**:
  ```
  user-a: households [h1, h2]; users[user-a]; memberships[m-a-h1, m-a-h2];
          lists[list-h1, list-h2]; items[item-h1-1, item-h1-2, item-h2-1]; item_checks 1
  user-b: households [h1];     users[user-b]; memberships[m-b-h1];
          lists[list-h1];      items[item-h1-1, item-h1-2];           item_checks 1
  ```
  A gets H1+H2, B gets only H1. Exactly as required.

- **ANSWER to the plan's flagged open question**: sync streams do NOT require a direct
  partition column on every synced table. `items` (via `list_id -> lists.household_id`)
  and `item_checks` (via `item_id -> items.list_id -> lists.household_id`) synced
  correctly using nested `IN (SELECT ...)` subqueries. Denormalized household_id on
  items/item_checks is NOT needed. Stream queries support nested subqueries / JOINs;
  GROUP BY / ORDER BY / LIMIT are unsupported (docs).
  - One bucket-design note for the report: streams bucket by the values in the query
    (e.g. `my_items|0["list-h1"]`), so the partition key per bucket is list_id for items,
    item_id for item_checks. This works but means a row moving lists changes its bucket.
  - Cosmetic: synced-rows.mjs prints item_checks ids blank because item_checks has a
    composite PK (no `id` column), so object_id is empty in the op. Count is correct.

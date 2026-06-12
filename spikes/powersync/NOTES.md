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

### Step 2 — IN PROGRESS

- **Expo SDK deviation**: `create-expo-app@latest` produced **Expo SDK 56 / RN 0.85 /
  React 19.2**, not the plan's "SDK 55 / RN 0.83". The plan said the spike app is
  standalone and need not match the main app, so I accepted the newer SDK rather than
  pin backwards. Recorded as a deviation. (Main app is on SDK 56 per commit 847a68b3.)
- Removed create-expo-app's template extras (`.claude/`, `AGENTS.md`, `CLAUDE.md`,
  `LICENSE`) so a nested CLAUDE.md doesn't confuse agents. Template `.gitignore` already
  covers node_modules, /ios, /android, .expo — no addition needed.
- **PowerSync client packages** (current, from live README, NOT memory):
  - `@powersync/react-native@1.35.4`
  - `@powersync/react@1.10.0` (hooks: PowerSyncContext, useQuery, useStatus)
  - adapter: `@journeyapps/react-native-quick-sqlite@2.5.2` (chosen over op-sqlite:
    simpler, no use_frameworks/staticLibrary config; auto-added its Expo config plugin)
  - `@azure/core-asynciterator-polyfill@1.0.2` (imported first in App.tsx — required
    for watched/reactive query async iterators)
  - dev: `@babel/plugin-transform-async-generator-functions@7.29.7` in babel.config.js
  - `react-native-get-random-values` + `uuid` for client-generated row ids.
  - Note: SDK 1.35 pre-bundles the fetch/stream polyfills, so the older long polyfill
    list (react-native-fetch-api, web-streams-polyfill, base-64, text-encoding) is NOT
    needed anymore. Verified against the repo README.
- **Auth in client**: client does NOT sign tokens (no RN crypto). Added a backend route
  `GET /api/auth/token?user_id=...` that signs a dev token server-side. Connector
  fetchCredentials() calls it. This is the Phase-1 dev-token path; Phase 2 (decision
  question 4) swaps in Clerk JWTs.
- **Client schema**: mirrors the synced tables. `id` is implicit; item_checks carries
  item_id/user_id as columns (composite PK lives server-side; upload upserts on them).
- `npx tsc --noEmit` passes clean.
- Simulators for the two-device demo (operator's iPhone 17 Pro 261F... left alone):
  - Sim 1: **iPhone 17** `F6EFD6E9-E4E6-472D-B500-FF3E6877A232` — acts as Alice (A).
  - Sim 2: **iPhone 17e** `DE4DB10F-A42B-472A-89A6-567C554A63BF` — acts as Bob (B).
- Native build via `expo run:ios` running in background (log /tmp/expo-build-sim1.log).
  Using xcodebuild (Xcode 26.5) + CocoaPods 1.16.2. ios/ is prebuild-generated, gitignored.

- **ERROR + FIX: pnpm + Metro module resolution.** First build (default pnpm symlinked
  node_modules) compiled natively and launched, but the JS runtime threw:
  `Could not resolve @journeyapps/react-native-quick-sqlite`. Cause: pnpm's symlinked
  `.pnpm` store layout isn't resolved by Metro / RN autolinking. Fix: added
  `app/.npmrc` with `node-linker=hoisted` (flat node_modules), `rm -rf node_modules ios`,
  reinstalled, and re-ran `expo run:ios`. After hoisting, the package is a real directory
  (not a symlink) and resolves. This `.npmrc` IS committed — it's required for the app to
  run. (This is the standard Expo + pnpm workaround; worth flagging for the real
  replatform since the main repo uses pnpm.)
  - Build 2 log: /tmp/expo-build-sim1b.log.

- **ERROR + 2nd FIX: SQLite adapter (quick-sqlite -> op-sqlite).** Even after hoisting,
  the runtime still threw `Could not resolve @journeyapps/react-native-quick-sqlite`.
  Root cause: PowerSync's `ReactNativeQuickSqliteOpenFactory` does a dynamic bare
  `require('@journeyapps/react-native-quick-sqlite')` from its pre-bundled `dist/index.js`.
  Metro will not bundle a package that is only referenced via a runtime require and is
  never statically imported, so the require fails at runtime regardless of node-linker.
  - Attempt: added `app/metro.config.js` blocking inline-requires for
    `@powersync/react-native` (per the SDK README). Bundle count changed (746 -> 734) but
    the error persisted — confirming the issue is "package not bundled", not inlining.
  - FIX (genuinely different, 2nd approach): switched to the op-sqlite adapter
    (`@powersync/op-sqlite@0.9.x` + `@op-engineering/op-sqlite@16.x`) and constructed an
    explicit `OPSqliteOpenFactory` passed as `database` to `PowerSyncDatabase`. op-sqlite
    is imported STATICALLY by the adapter, so Metro always bundles it. Removed the
    quick-sqlite Expo config plugin from app.json (op-sqlite autolinks; no plugin).
    Kept metro.config.js (harmless, still recommended by the SDK README).
  - This required a native rebuild (op-sqlite is a new native module). Build 3 log:
    /tmp/expo-build-sim1c.log.
  - Lesson for the real replatform: prefer op-sqlite + explicit OPSqliteOpenFactory on
    RN; the implicit quick-sqlite path is fragile with Metro bundling.

- **Final adapter versions**: `@powersync/op-sqlite@0.9.10`, `@op-engineering/op-sqlite@16.2.0`.

### Step 2 — DONE (VERIFIED)

- Both apps build + run. After the op-sqlite switch, the app launches clean on both
  sims showing "connected · synced", "Groceries (H1)", and items Milk + Eggs synced down
  from Postgres via PowerSync. Only warning is the SafeAreaView deprecation (cosmetic).
- Drove the UI with `rocketsim` (accessibility-id taps/types + screenshots). Worked well.
  Note: `rocketsim interact type` takes the text as a POSITIONAL arg (not `--text`), and
  element ids are per-snapshot (re-read elements before each tap).

- **VERIFICATION (Step 2 acceptance) — PASS, cross-device propagation**:
  - Sim 2 switched to Bob (B). Sim 1 stays Alice (A).
  - Typed "Bananas" + tapped Add on Sim 1 (A). Polled Sim 2 (B) for the row.
  - It appeared on Sim 2 on the FIRST poll iteration. Measured wall-clock T0(tap)→found
    = **0.96 s**, which bounds-from-above the true propagation (it includes the rocketsim
    tap round-trip, optimistic local insert, uploadData→Node→Postgres, PowerSync
    replication, sync-down to Sim 2, AND my element-read poll overhead). No manual refresh.
  - Confirmed the row in Postgres: `items` has `name=Bananas, list_id=list-h1,
    created_by_user_id=user-a` with a client-generated UUID id → full write round-trip
    through the Node endpoint (LWW + authz) is real, not just local-optimistic.
  - Screenshot evidence saved: /tmp/spike-shots/sim1-alice.png, /tmp/spike-shots/sim2-bob.png
    (sim2 shows Bob selected + Milk/Eggs/Bananas).

- **Bonus check — per-user checked state (ADR-0002)**: tapped Milk on Sim 2 (Bob).
  Postgres `item_checks` then held TWO rows for item-h1-1: `(user-a)` (seeded) and
  `(user-b)` (Bob's tap) — distinct per-user rows, no conflict. The split-out check model
  syncs correctly through PowerSync.

- **Backend logic also unit-checked directly via curl** (before wiring the app):
  - A adds to list-h1 (H1, A member) → applied.
  - B adds to list-h2 (H2, B NOT member) → 403 rejected.
  - A sends a stale `updated_at` PATCH → skipped (`stale-lww`); row unchanged in Postgres.

## How to observe the running demo (for the reviewer)

State left running at end of Phase 1:
- Docker stack UP (`cd spikes/powersync && docker compose ps` → 4 services).
- Persistent Metro on :8081 (bg). If it died, restart: `cd spikes/powersync/app && npx expo start --dev-client`.
- App installed + running on BOTH sims:
  - iPhone 17  `F6EFD6E9-E4E6-472D-B500-FF3E6877A232` (Alice)
  - iPhone 17e `DE4DB10F-A42B-472A-89A6-567C554A63BF` (Bob)
- Operator's iPhone 17 Pro `261F6427-...` was left untouched.

Re-verify Step 1: `cd spikes/powersync && node tools/synced-rows.mjs user-a` / `... user-b`.
Relaunch an app: `xcrun simctl launch <UDID> com.dont-forget.app` (Metro must be up).
Inspect Postgres: `docker compose exec pg-source psql -U postgres -p 5499 -d postgres -c "table items;"`

NOTE: the demo DB now contains the test artifacts (the "Bananas" item and Bob's Milk
check) as living proof. To reset to the pristine seed: `docker compose down -v && docker compose up -d`.

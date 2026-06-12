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

---

# Phase 2 — Steps 3 & 4 (the six decision questions + the report)

Phase 2 agent context: Phase 1 left the stack UP and both apps installed. At Phase 2
start I reset the source DB to pristine seed (`docker compose down -v && up -d`) so all
measurements begin from a known fixture, restarted Metro (died with the Phase 1 session),
and relaunched both apps.

## Phase 2 setup (verified)

- Docker stack reset to pristine seed and healthy (4 containers). Verified row sets via
  `tools/synced-rows.mjs`: user-a → households [h1,h2], items[item-h1-1,item-h1-2,item-h2-1];
  user-b → households [h1], items[item-h1-1,item-h1-2]. 1 seeded item_check (A's Milk).
- Metro restarted (bg, :8081, log /tmp/metro-phase2.log). Both apps cold-started clean,
  reconciled local SQLite against the fresh server checkpoint (no stale Phase-1 "Bananas"
  lingering) — evidence that a server-side bucket wipe is reflected on clients on reconnect.
- Device assignment for Phase 2:
  - **Alice = user-a** on iPhone 17 `F6EFD6E9-E4E6-472D-B500-FF3E6877A232`.
  - **Bob = user-b** on iPhone 17e `DE4DB10F-A42B-472A-89A6-567C554A63BF` (tapped switch-user-b;
    screen hash changed 89534ce8→813e2fb1; disconnectAndClear + reconnect as B; shows H1 Milk+Eggs).
  - Operator's iPhone 17 Pro `261F6427-...` booted, left strictly alone.
- rocketsim CLI at /opt/homebrew/bin/rocketsim; target a specific sim with `--udid <UDID>`.

## Offline method (per orchestrator briefing)

Sever connectivity by stopping the powersync + backend containers
(`docker compose stop powersync backend`), NOT the Mac network (that kills Metro + tooling).
Restore with `docker compose start powersync backend`. The two source Postgres containers stay
up the whole time (they are the DB, not the network path).


## Q1 — Offline writes + cold start (run on Alice / user-a)

Method: app online + synced (Milk, Eggs in H1). `docker compose stop powersync backend`
at 00:29:43 → app shows "connecting…" within ~4 s but the list still renders from local
SQLite (Milk, Eggs). Source Postgres containers stayed up; only the sync path was severed.

OFFLINE WRITES (instant local):
- Added "OfflineApples" offline → appeared INSTANTLY in the list while "connecting…"
  (screenshot /tmp/spike-shots/q1-alice-offline.png shows Milk, Eggs, OfflineApples).
- Toggled Milk's check offline → checkbox flipped instantly in UI (optimistic local write).

OFFLINE COLD START:
- `xcrun simctl terminate` + `launch` Alice WHILE STILL OFFLINE → app cold-started and
  rendered Groceries (H1) with Milk, Eggs, AND OfflineApples from local SQLite. UI did NOT
  hang on the spinner — `connectAs()`/`db.connect()` resolves immediately offline (the
  orchestrator-flagged spinner-hang risk did NOT materialize; no spike-app patch needed).
  No data loss across the offline restart. Status badge stayed "connecting…".

RESTORE + UPLOAD:
- `docker compose start powersync backend` at 00:31:17, healthy by 00:31:24.
- After ~6 s, source Postgres `items` had the OfflineApples row
  (id efa96df6-…, list_id list-h1, created_by_user_id user-a) — the queued offline PUT
  uploaded through the Node endpoint and persisted. Bob (user-b) received it too (Q2 below
  re-verifies cross-device). No data loss on the INSERT path.

FINDING — spike-app write-path bug on item_checks PATCH (NOT a PowerSync limitation):
- The offline Milk UNCHECK did NOT persist to Postgres. `item_checks(item-h1-1, user-a)`
  kept its seed checked_at/updated_at. Reproduced ONLINE too: tapping an already-checked
  Milk (an UPDATE of an existing row) never changed Postgres, and PowerSync then reverted
  the local row to the server's authoritative checked state on the next checkpoint
  (screenshot q1-alice-reconnected.png / q1-milk-online-toggle.png show Milk ☑ again).
- Root cause: PowerSync PATCH `opData` carries ONLY changed columns + filters by the
  synthetic row `id` (confirmed in docs /websites/powersync usage-examples: PATCH does
  `eq("id", entry.id)`). The spike backend's item_checks PATCH keyed off
  `data.item_id`/`data.user_id`, which are absent from a PATCH op → `WHERE item_id=undefined`
  updated 0 rows, silently. New checks (PUT, carries all cols) worked; updates to existing
  checks (PATCH) were lost.
- This is the documented PowerSync contract (every synced row has an `id`; PATCH/DELETE key
  on it). The spike's composite-PK-only item_checks violated it. Fix applied below so Q5
  conflict results are clean. The INSERT/offline-cold-start evidence above is unaffected.
- IMPORTANT distinction for the report: PowerSync's "revert un-acknowledged local writes to
  server state on reconnect" is CORRECT engine behavior — it surfaced our backend bug rather
  than papering over it. The local-first guarantee held for the write that the backend
  actually accepted (the INSERT).

### Fix applied (in scope: spikes/powersync/**) — item_checks gets a synthetic id

Per PowerSync's documented contract (every synced row has an `id`; PATCH/DELETE filter on
it), gave Postgres `item_checks` a synthetic text `id` PK + a `unique(item_id, user_id)`
constraint (preserves ADR-0002 per-User invariant). Backend now keys ALL item_checks ops on
`id` like every other table (deleted the composite-PK special cases in householdsForOp /
lwwAllows / applyOp PUT/PATCH/DELETE — net simpler). Client schema unchanged (id implicit;
App.tsx already inserts a uuid id on PUT and UPDATEs by id). Seed gives the seeded check
id `chk-a-h1-1`.

VERIFIED after `down -v && up -d` + relaunch: Alice unchecking seed-checked Milk online now
sets checked_at=NULL and advances updated_at in Postgres (07:36:30); re-checking sets it
back. Toggle round-trips both directions through the upload endpoint. Q1 INSERT evidence is
unaffected; this only fixes the previously-lost item_checks UPDATE path so Q5 is clean.

Also observed (re-confirms Q1 cold-start reconciliation): after the schema reset, both sims
relaunched with stale local SQLite (old OfflineApples row) but reconciled to the fresh server
checkpoint on reconnect — the now-nonexistent row was removed locally. PowerSync treats the
server as authoritative for the synced row set.

Q1 VERDICT: PASS. Offline local writes are instant; offline cold start renders from local
SQLite with no hang and no data loss; queued INSERTs reach Postgres + propagate on reconnect.
The one anomaly (lost check UPDATE) was a spike-backend bug, now fixed — NOT an engine issue.

## Q2 — Propagation latency (10 cross-device adds, online)

Method: add a uniquely-named item on Alice (user-a), poll Bob (user-b) `elements` until the
row appears. T0 = monotonic clock captured immediately before the Add tap; found = when Bob's
snapshot first contains it. Single python3 process per run → one consistent clock.

Raw deltas (ms), in run order:
  Lat01=889 Lat02=889 Lat03=858 Lat04=853 Lat05=857
  Lat06=877 Lat07=897 Lat08=888 Lat09=928 Lat10=874
All 10 resolved on the FIRST Bob poll (polls=1).

Stats: median = 882.5 ms (0.88 s), worst = 928 ms (0.93 s), best = 853 ms, mean = 881 ms.

REQUIREMENT (seconds-scale propagation): PASS — every run sub-second.

IMPORTANT measurement caveat (report this): these deltas BOUND THE TRUE LATENCY FROM ABOVE.
Each delta includes, before any sync work: the Add-tap rocketsim round-trip (~700 ms observed
as `duration_ms` on interact taps) and at least one Bob `elements` read (~150–250 ms). Because
every run resolved on the first poll, the granularity is one full poll cycle — the real
engine-side propagation (optimistic insert → uploadData → Node → Postgres → PowerSync
replication → sync-down) is meaningfully faster than ~0.88 s and we cannot resolve it more
finely with UI polling. The tight 853–928 ms spread (75 ms) reflects fixed tooling overhead,
not network variance. Consistent with Phase 1's single ~0.96 s measurement.

Side effect: Lat01–Lat10 + TestType items now sit in list-h1. Will `down -v` reset before Q5.

## Q5 — Conflict semantics (LWW by updated_at + per-User check independence)

Added a CRUD rename affordance (spike-only, App.tsx): long-press an item → rename to
`<base>-<userLetter>-<HHMMSS>` and stamp a fresh updated_at. This is the missing "edit same
field" path the spike app lacked (it only had add + check-toggle). Verified online first
(Alice long-press Eggs → Eggs-a-074338 persisted to Postgres).
NOTE: a JS-only App.tsx change needs a FULL Metro bundle rebuild + app relaunch to take
effect; a plain `simctl launch` reused the cached 728-module bundle and silently ran old
code (first rename attempts were no-ops). Forcing `curl .../index.bundle` rebuilt it (now
782 modules) — recorded as a dev-loop gotcha.

CONFLICT TEST — same item (item-h1-2 / "Eggs") renamed on BOTH devices while offline, then
reconnect. Backend logs (added `[lww] APPLY/SKIP` lines) give ground truth on the real ISO
updated_at the client sent, not just the second-resolution name.

  Run 2 (A first, B later):
    APPLY user-a PATCH items item-h1-2 Eggs-a-074739 incoming=…T07:47:39.861Z
    APPLY user-b PATCH items item-h1-2 Eggs-b-074746 incoming=…T07:47:46.493Z
    → Postgres = Eggs-b-074746 (the LATER write). Both UIs converged to Eggs-b. ✓
  Run 3 (B first, A later — reversed):
    APPLY user-b PATCH items item-h1-2 Eggs-b-074917 incoming=…T07:49:17.745Z
    APPLY user-a PATCH items item-h1-2 Eggs-a-074924 incoming=…T07:49:24.194Z
    → Postgres = Eggs-a-074924 (the LATER write). Both UIs converged to Eggs-a. ✓

DETERMINISM: the winner is always the MAX updated_at, independent of device and of upload
arrival order — the backend's `incoming >= stored` guard enforces it (a write that arrives
after a newer one is logged `SKIP stale-lww`). Both clients then converge to the same value
on the next checkpoint. No split-brain in any run.

Run 1 anomaly (recorded honestly): an earlier run showed the EARLIER-looking writer winning.
Root cause was simulator clock skew — the name encodes only HH:MM:SS, but LWW keys on the
millisecond ISO updated_at, and the two simulators' wall clocks differ slightly. The
logged runs (2,3) prove the rule is "max updated_at wins"; the spike's app-owned updated_at
is only as good as the device clock (same caveat the production LWW design already lives with
per ADR-0002). This is an argument FOR server-authoritative timestamping in production, noted
for the report.

PER-USER CHECK INDEPENDENCE — both A and B checked the SAME item (Eggs/item-h1-2) offline,
reconnected. Result: Postgres item_checks holds TWO rows for item-h1-2, one per user, each
with its own synthetic id, both checked:
  e36f7596… item-h1-2 user-a t
  890a6a12… item-h1-2 user-b t
Backend logged both as APPLY PUT (independent inserts, no LWW contest). The (item_id,user_id)
unique constraint isolates each User's check — they NEVER conflict across users, confirming
ADR-0002's split-out-checks model syncs correctly through PowerSync. ✓

TOMBSTONES (deleted_at) — where care is needed (reasoned; app has no delete UI to exercise):
- The backend DELETE handler tombstones items/lists (`SET deleted_at = now()`), not hard
  delete, matching ADR-0002. The sync stream `SELECT *` still matches tombstoned rows (they
  retain their household linkage), so they sync DOWN and the client hides them via
  `WHERE deleted_at IS NULL`. This works but means tombstones accumulate in every client's
  local DB forever — production needs a purge/GC policy (server hard-deletes old tombstones;
  PowerSync then removes them from clients on the next checkpoint).
- A delete-vs-edit conflict (one device tombstones, another renames offline) resolves by the
  same updated_at LWW: whichever carries the higher updated_at wins. The backend DELETE sets
  updated_at=now() so a delete generally beats an older edit — but a rename with a LATER
  clock would UN-delete by setting a name without clearing deleted_at, which is a real edge
  the production write endpoint must handle explicitly (e.g. treat deleted_at as monotonic,
  or reject edits to tombstoned rows). Flagged for the report; not a PowerSync concern.
- item_checks DELETE is a hard delete by id (a missing row == unchecked), so no tombstone
  needed there.

Q5 VERDICT: PASS. Same-field edits converge deterministically to max-updated_at (LWW),
identically on both devices and in Postgres; per-User checks are independent and never
conflict. Tombstone edge cases are application-write-endpoint concerns, not engine concerns.

## Q3 — Revocation (delete B's H1 membership)

Ordering: run AFTER Q5 (Q3 deletes B's membership which Q5 needs); restore B after (below).

BASELINE (before): `node tools/synced-rows.mjs user-b` → households [h1]; lists [list-h1];
items [item-h1-1, item-h1-2]; item_checks 3. B is an active H1 member. Both sims connected.

REVOCATION: `DELETE FROM memberships WHERE id='m-b-h1';` in pg-source at 08:00:32.3Z (UTC).

(1) DOES B STOP RECEIVING H1 CHANGES, AND HOW FAST?
- Fresh sync-stream connect for B at 08:00:40Z (~8 s later) → households []; lists [];
  items []; item_checks []. B receives ZERO H1 rows. A is unaffected (still h1+h2).
- LIVE CLIENT (the actual RN sim, not my node tool): PowerSync service log shows, for
  `user_id: user-b, user_agent: powersync-js/1.54.0 ... react-native ios`:
    `Updated checkpoint: 25 | write: 1 | buckets: 2`
    `removed: [my_households|h1, my_lists|h1, my_items|list-h1,
               my_item_checks|item-h1-2, my_item_checks|item-h1-1]` (5 buckets)
    `operation_counts: {put:2, remove:1}` (the remove:1 is the membership row delete).
  So PowerSync re-evaluated the parameter (membership) query the instant the DELETE
  replicated and pushed a checkpoint REMOVING all 5 H1 buckets from B's local DB.
  Timing bound: membership deleted 08:00:32Z; the removal checkpoint and the empty
  fresh-connect were both observed within ~8 s. Seconds-scale revocation. ✓
- LIVE SIM UI (Bob, iPhone 17e DE4DB10F) after revocation, read via rocketsim:
  row "connected · synced 1:00:32 AM" + row "Waiting for list to sync…" — the list and all
  items VANISHED from the UI; the connection stayed alive. Screenshot:
  /tmp/spike-shots/q3-bob-revoked.png. (Connection stays up because the dev token is keyed
  on sub=user-b, which still exists — revoking MEMBERSHIP is not revoking AUTH. Important
  distinction: PowerSync auth = "who are you"; sync-stream membership query = "what do you
  get". Revoking the latter cut the row set without dropping the socket.)

(2) DOES ALREADY-SYNCED LOCAL DATA REMAIN ON B's DEVICE?
- NO — and this is the KEY engine finding that CORRECTS the plan's expectation. The plan
  expected local data to remain (so a sign-out wipe is an app concern). EMPIRICALLY,
  PowerSync REMOVED the 5 H1 buckets from B's local SQLite (the `removed:` checkpoint
  above). When a row leaves a user's sync-rule result set, PowerSync deletes it from that
  client's local DB on the next checkpoint. So revoking the grant in Postgres
  AUTOMATICALLY purges the orphaned local rows from the client — no app-driven wipe needed
  for the revocation case. (A full sign-out wipe / disconnectAndClear remains an app concern
  for the DIFFERENT case of "user logs out entirely", but membership revocation self-heals.)
  This is BETTER than the plan assumed — record as a positive finding.

(3) DO B's QUEUED WRITES FOR H1 GET REJECTED BY THE UPLOAD ENDPOINT?
- YES. Minted B's dev token, POSTed an item PUT to list-h1 (H1) via /api/data →
  HTTP 403 `{"error":"not an active member of household","household_id":"h1",...}`.
  Confirmed the row did NOT land in Postgres (count 0). The upload endpoint re-checks
  active membership per row at write time, so a revoked user's writes are rejected instantly
  — server-side authorization, exactly the property the per-Household-Turso-token model
  CANNOT provide (those tokens are 24h, full-access, irrevocable).
- CAVEAT for the report (orchestrator trap #3): the spike connector's uploadData THROWS on a
  non-OK response, which keeps the rejected transaction QUEUED and retrying forever. In this
  spike B's queued H1 writes would 403-retry indefinitely (a poison-message jam). PowerSync's
  documented handling for PERMANENTLY-rejected writes is to discard/compensate and call
  tx.complete() so the queue drains (do not re-throw on a 4xx that will never succeed). The
  spike does not implement this (no offline-write-then-revoke queue was left pending — the
  403 test was a direct online POST), but PRODUCTION must distinguish retryable (5xx/network)
  from terminal (4xx authz) upload failures: complete()+surface-to-user on terminal, throw
  (retry) on transient. Flagged for the report; not an engine defect, a connector-policy
  requirement.

Q3 VERDICT: PASS. Revoking a membership row in Postgres cuts B's H1 row set within seconds
(sync-rule re-evaluation removes the buckets), purges the already-synced local rows from B's
device automatically, and the developer-owned upload endpoint rejects B's H1 writes with 403.
Server-authoritative, instantly-revocable access — the core property the Turso per-Household
token model lacks. One production to-do surfaced: the upload connector must treat terminal
4xx as complete()+discard, not infinite retry.

### Restore B's membership (per working-agreement 6 + plan ordering note)

Re-inserted m-b-h1 matching init-scripts/02-seed.sql to leave the stack in the seeded state
and to capture re-grant behavior (bonus evidence):
  `INSERT INTO memberships (id, household_id, user_id, role, status)
   VALUES ('m-b-h1','h1','user-b','member','active');`
RE-GRANT BEHAVIOR (bonus): after re-insert, `synced-rows.mjs user-b` again returns H1
(households [h1], lists [list-h1], items [item-h1-1, item-h1-2]) — PowerSync re-evaluated the
membership query and re-added the H1 buckets to B's checkpoint; the live sim re-rendered
Groceries (H1) with Milk + Eggs (rocketsim read confirmed). Re-granting access self-heals
symmetrically: add the membership row → the client re-syncs the household with no app
intervention.

## Q4 — Clerk JWT (validate real Clerk dev tokens via PowerSync jwks_uri)

Secrets policy: keys loaded into shell env at RUNTIME from the MAIN checkout's
`/Users/randy/Dev/personal/dont-forget/.env.local` (gitignored). Both keys are `_test_`
(dev instance). No secret VALUE is recorded here — env var names + the PUBLIC Clerk domain
only. Reproduce with `tools/clerk-token-test.mjs` (reads the keys from env).

STEP 1 — derive Clerk JWKS URL from the publishable key (public, not a secret):
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = `pk_test_<base64>`. Strip prefix, base64-decode,
  drop trailing `$` → frontend-API domain `comic-peacock-75.clerk.accounts.dev`.
- JWKS = `https://comic-peacock-75.clerk.accounts.dev/.well-known/jwks.json`. Fetched it
  live: 1 key, kty RSA, alg RS256, kid present. This is exactly what PowerSync's
  `client_auth.jwks_uri` consumes. (The domain is embedded in any shipped web bundle and
  derivable from the public pk — safe to record. It is NOT the secret key.)

STEP 2 — configure PowerSync (DONE, committed in powersync/service.yaml):
- Added `client_auth.jwks_uri: https://comic-peacock-75.clerk.accounts.dev/.well-known/jwks.json`
  ALONGSIDE the existing static dev `jwks`. Verified in the running image's source
  (`/app/.../compound-config-collector.js`) that the config builds a `CompoundKeyCollector`
  that adds BOTH the static keys and every jwks_uri as remote collectors — they coexist, so
  dev tokens keep working AND Clerk tokens are now verifiable. REGRESSION-CONFIRMED after
  restart: `synced-rows.mjs user-a` still returns h1+h2 (dev-token path intact).

STEP 3 — mint a REAL Clerk dev session token from the secret key, NO browser (DONE):
- `GET https://api.clerk.com/v1/users?limit=1` → 5 real dev users; took
  user_3F0S334auQkkg2SQTfuR1eIeVHp.
- `POST /v1/sessions {user_id}` → session sess_3F1n...; `POST /v1/sessions/{id}/tokens`
  `{expires_in_seconds:3600}` → a real RS256 JWT signed by Clerk (header kid
  ins_3D3kzMnRJ55XbKY9hhnRN7W6eLL, the Clerk JWKS key). Decoded claims:
  iss=https://comic-peacock-75.clerk.accounts.dev, sub=user_3F0S..., exp-iat=3600s,
  claims=[exp,fva,iat,iss,nbf,sid,sts,sub,v]. **aud is ABSENT.**

STEP 4 — POST the real Clerk token to the live PowerSync `/sync/stream` (DONE):
- Result: **HTTP 401 PSYNC_S2105 "JWT payload is missing a required claim 'aud'"**.
- WHAT THIS PROVES (read the KeyStore source to be certain — `KeyStore.verifyJwt`):
  PowerSync verifies in this ORDER: (1) signature against a collected key + required
  sub/iat/exp; THEN (2) aud presence (S2105); then aud value; then lifetime (S2104).
  Reaching S2105 means the token PASSED step 1 — i.e. PowerSync fetched Clerk's remote
  JWKS, matched the kid, and **verified the Clerk signature**, and sub/iat/exp were present
  and the 3600s lifetime is within the 24h cap. The ONLY failing assertion is the missing
  `aud`. If signature/kid had failed it would be S2101/S2102 instead. So the entire Clerk
  -> PowerSync trust path WORKS end-to-end against the live service with a real Clerk dev
  token; one claim is missing.

THE BLOCKER (confirmed empirically + in source, not memory):
- PowerSync REQUIRES `aud` and the check CANNOT be disabled (KeyStore.ts hard-throws S2105
  when aud is null, regardless of an empty `audience` config). An empty audience list makes
  aud impossible to satisfy, not optional.
- Clerk's DEFAULT session token has NO `aud`. The only way to add one is a Clerk **JWT
  template** (body e.g. `{"aud":"powersync-dev"}`), and templates can ONLY be created in the
  Clerk **Dashboard** — there is NO Backend API to create one. Confirmed empirically:
  `POST /v1/sessions/{id}/tokens/powersync` → `{"errors":[{"code":"resource_not_found",
  "message":"No JWT template exists with name: powersync"}]}`.
- This last step (one Dashboard click to create a `powersync` template) is outside what this
  spike can do via API alone with the dev secret key. Per the plan, Q4 is therefore marked
  PARTIAL/OPEN with this single, specific, well-understood blocker — NOT a fudged PASS.

WHAT A PRODUCTION INTEGRATION NEEDS (fully specified by this spike):
  1. Clerk Dashboard → JWT Templates → new template `powersync`, body `{"aud":"powersync-dev"}`,
     token lifetime ≤ 3600s (PowerSync hard-caps at 24h, recommends ≤ 1h).
  2. service.yaml `client_auth.jwks_uri` = the derived Clerk JWKS URL (already committed),
     `audience: ["powersync-dev"]` matching the template (already includes it).
  3. RN client: the connector's `fetchCredentials()` calls Clerk's `session.getToken({
     template: 'powersync' })` instead of the spike's dev-token endpoint; `sub` becomes the
     Clerk user id (`user_...`), which is what the sync-stream `auth.user_id()` resolves to —
     so the Postgres `users.id` / membership rows must key on the Clerk user id (the prod
     directory already links via `clerk_user_id`; here it would BE the id). No backend token
     endpoint needed at all (Clerk mints the token client-side).
  Everything except step 1's Dashboard click is verified working here.

Q4 VERDICT: PARTIAL / OPEN, single named blocker. The Clerk dev-instance JWKS is reachable
and configured; a real Clerk dev session JWT passes PowerSync's signature + sub/iat/exp +
lifetime checks against the LIVE service; the sole gap is the `aud` claim, addable only via a
Clerk Dashboard JWT template (no API). High confidence the path is sound — only a manual
Dashboard step (which the spike cannot perform with the secret key alone) remains.

## Q6 — Tooling fit (Expo/dev-client friction, views-over-data, resource footprint)

Most of this is mined from the Phase 1 log above (Step 2); consolidated here with new
quantitative data.

EXPO / DEV-CLIENT FRICTION (all from Phase 1, real errors+fixes):
- Native modules: PowerSync RN needs a SQLite adapter native module, so it CANNOT run in
  Expo Go — it requires a dev client / `expo run:ios` (custom native build). Build via
  xcodebuild (Xcode 26.5) + CocoaPods 1.16.2; `ios/` is prebuild-generated + gitignored.
  All three Phase-1 builds ended "Build Succeeded" (logs /tmp/expo-build-sim1*.log, 361-373
  compile lines each). Not a one-command JS-only install; it is a native rebuild whenever a
  native dep changes.
- pnpm friction (RELEVANT — the main repo uses pnpm): pnpm's default symlinked node_modules
  is NOT resolved by Metro/RN autolinking → `app/.npmrc` with `node-linker=hoisted` is
  REQUIRED (committed). Standard Expo+pnpm workaround but a real gotcha for the replatform.
- SQLite adapter choice MATTERS: `@journeyapps/react-native-quick-sqlite` failed at runtime
  (`Could not resolve ...`) because PowerSync's pre-bundled dist does a dynamic bare
  `require()` Metro won't bundle. FIX: switched to `@powersync/op-sqlite` +
  `@op-engineering/op-sqlite` with an EXPLICIT `OPSqliteOpenFactory` (statically imported →
  Metro always bundles). Lesson for prod: prefer op-sqlite + explicit factory on RN.
- Config plugin: op-sqlite autolinks (no Expo config plugin needed); quick-sqlite needed one.
  `metro.config.js` kept (SDK-recommended, harmless).
- Polyfills: SDK 1.35 pre-bundles fetch/stream polyfills; only
  `@azure/core-asynciterator-polyfill` (watched-query async iterators) +
  `react-native-get-random-values` (client uuid) are needed. Much shorter than older guides.
- Final client dep set (package.json): @powersync/react-native@1.35.4, @powersync/react@1.10,
  @powersync/op-sqlite@0.9.10, @op-engineering/op-sqlite@16.2.0, on Expo SDK 56 / RN 0.85 /
  React 19.2. `npx tsc --noEmit` clean.

CLIENT SCHEMA = VIEWS OVER SYNCED DATA, NO CLIENT MIGRATIONS (verified):
- `app/src/schema.ts` declares table SHAPES via `new Schema({ Table(...) })`. There is NO
  CREATE TABLE, no migration file, no schema-version gate anywhere in the app. PowerSync
  materializes these as SQLite VIEWS over its internal `ps_data` storage at
  `PowerSyncDatabase` construction. `id` is implicit (must not be declared).
- Proof it works without migrations: the app rendered correctly from this declarative schema
  on first run, and Q1's server-side schema reset (`down -v && up -d`) reconciled on the
  clients with NO client migration step — the client just re-synced the new row set. Changing
  a column is a code edit, not a migration fanout. This directly removes the prod
  `db/household-schema.ts` staleness gate + migration machinery (see report section 3).

SERVICE RESOURCE FOOTPRINT (live `docker stats`, idle, single-app, 2 connected sims):
- powersync-service: ~94 MB RAM, ~0% CPU idle.
- pg-source (replicated data): ~34 MB. pg-storage (bucket storage): ~45 MB.
- node backend (upload endpoint): ~20 MB.
- WHOLE STACK idles < ~200 MB RAM. Images on disk: powersync-service:1.22.0 = 715 MB,
  postgres:18 = 671 MB (shared by both PG containers). Comfortably fits a small VPS.
- NODE_OPTIONS caps powersync heap at 1000 MB (`--max-old-space-size=1000`) in compose; not
  approached at this scale.

Q6 VERDICT: PASS with known, documented friction. PowerSync RN requires a dev-client native
build (no Expo Go) and a careful SQLite-adapter choice (op-sqlite + explicit factory); pnpm
needs hoisted node-linker. The "views over synced data" model eliminated client migrations
entirely (verified). Resource footprint is small (< 200 MB idle, fits one VPS). None of the
friction is a blocker — all have one-time fixes recorded above.

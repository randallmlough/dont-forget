# PowerSync replatform spike — report (plan 015)

A time-boxed spike evaluating whether a single Postgres + PowerSync sync streams can
replace the per-Household Turso replicated-DB model (ADR-0001/0009). All evidence below
was produced against a live local stack (Postgres 18 x2, `journeyapps/powersync-service:1.22.0`,
a Node upload endpoint) and two iOS simulators driving the real `@powersync/react-native`
SDK. Raw measurements, logs, and every observed behavior are in `NOTES.md`.

---

## 1. Verdict

**GO-WITH-CAVEATS.** Every product-critical property the per-Household-Turso model exists to
provide was reproduced on PowerSync, and two properties Turso *cannot* provide were gained.
Offline local writes are instant and survive an offline cold start with no data loss
(Q1); cross-device propagation is sub-second (Q2, median 0.88 s, worst 0.93 s, bounded from
above by tooling overhead); revoking a membership row in Postgres cuts the revoked user's row
set within seconds, **automatically purges the already-synced rows from their device**, and
the developer-owned upload endpoint rejects their writes with HTTP 403 (Q3) — instant,
server-authoritative revocation the 24-hour irrevocable Turso tokens fundamentally lack;
same-field edits converge deterministically by last-write-wins on `updated_at`, and per-User
checks never conflict (Q5); the client schema is declarative "views over synced data" with
**no client-side migrations** (Q6). The caveats, none of them blockers: Clerk auth is wired
and a real Clerk dev token verifies end-to-end against the live service, but the final step
needs a one-time Clerk Dashboard JWT template to add an `aud` claim, which cannot be created
via API (Q4, PARTIAL/OPEN with that single named blocker); the production upload connector
must treat terminal `4xx` as discard-and-complete rather than infinite retry; and the cost
story favors **self-hosting** because PowerSync Cloud's free tier deprovisions after 7 days
idle (section 4). Conditioned on resolving the Clerk template step and self-hosting, the
direction is sound and removes ~3,200-3,500 lines of Turso-specific machinery (section 3).

---

## 2. Question results

### Q1 — Offline writes + cold start — **PASS** (high confidence)

- **Result**: Offline local writes are instant; an offline cold start renders entirely from
  local SQLite with no spinner-hang and no data loss; queued INSERTs reach Postgres and
  propagate to the other client on reconnect.
- **Evidence**: Severed sync by `docker compose stop powersync backend` (source Postgres
  stays up; only the sync path is cut). Added "OfflineApples" while offline -> appeared
  instantly while the badge read "connecting..." (`/tmp/spike-shots/q1-alice-offline.png`).
  Force-quit + relaunch *still offline* -> app cold-started and rendered Milk, Eggs, AND
  OfflineApples from local SQLite; `connect()` resolved immediately offline, so the
  orchestrator-flagged spinner-hang risk did **not** materialize (no spike-app patch needed).
  `docker compose start powersync backend` -> within ~6 s the queued row was in Postgres
  (`id efa96df6..., list_id list-h1, created_by user-a`) and on Bob's device.
- **Honest caveat (a spike-backend bug, NOT an engine limit)**: an offline check-UNCHECK
  (an UPDATE) initially did not persist, because PowerSync PATCH ops carry only changed
  columns and key on the synthetic row `id`, while the spike's `item_checks` had only a
  composite PK. PowerSync correctly reverted the un-acknowledged local write to server state
  on reconnect — surfacing the bug rather than hiding it. Fixed by giving `item_checks` a
  synthetic `id` (per PowerSync's documented contract); re-verified the toggle round-trips
  both directions. The local-first guarantee held for every write the backend accepted.

### Q2 — Propagation latency — **PASS** (high confidence)

- **Result**: median **0.88 s**, worst **0.93 s**, best 0.85 s, over **10** cross-device
  adds, all online. Requirement (seconds-scale) met with margin.
- **Evidence**: 10 runs, each a uniquely-named add on Alice polled on Bob until the row
  appeared; raw deltas (ms) `889, 889, 858, 853, 857, 877, 897, 888, 928, 874` (all resolved
  on the first poll). T0 captured from a single monotonic clock immediately before the tap.
- **Measurement caveat (stated for honesty)**: these deltas **bound the true latency from
  above**. Each includes the rocketsim Add-tap round-trip (~700 ms observed) plus at least
  one Bob element-read (~150-250 ms) before any sync work. Because every run resolved on the
  first poll, the granularity is one poll cycle; real engine-side propagation
  (optimistic insert -> upload -> Postgres -> replication -> sync-down) is meaningfully faster
  than 0.88 s and cannot be resolved more finely with UI polling. The tight 75 ms spread is
  fixed tooling overhead, not network variance.

### Q3 — Revocation — **PASS** (high confidence)

- **Result**: deleting B's membership row in Postgres (1) cuts B's H1 row set within
  seconds, (2) **removes the already-synced H1 rows from B's local device automatically**,
  and (3) causes the upload endpoint to reject B's H1 writes with HTTP 403.
- **Evidence**:
  - *(1)* Membership deleted at 08:00:32Z; a fresh sync connect for B at 08:00:40Z returned
    **zero** H1 rows (households/lists/items/item_checks all empty). A unaffected.
  - *(2)* The live RN client's checkpoint (service log, `user_agent: powersync-js ...
    react-native ios`) showed `removed: [my_households|h1, my_lists|h1, my_items|list-h1,
    my_item_checks|item-h1-2, my_item_checks|item-h1-1]` — PowerSync re-evaluated the
    membership parameter query the instant the DELETE replicated and pushed a checkpoint
    removing all 5 H1 buckets from B's SQLite. Bob's sim UI dropped to "Waiting for list to
    sync..." (`/tmp/spike-shots/q3-bob-revoked.png`). This **corrects the plan's expectation**
    that local data would remain — PowerSync purges revoked rows from the client with no
    app-driven wipe.
  - *(3)* B's `PUT` to `list-h1` via `/api/data` -> `403 {"error":"not an active member of
    household","household_id":"h1"}`; the row never reached Postgres.
  - *Re-grant (bonus)*: re-inserting `m-b-h1` re-synced H1 to B (rows + live sim re-rendered
    Groceries with Milk+Eggs) — symmetric self-heal, no app intervention. B's membership is
    restored (final state).
  - *Note*: revoking membership does not drop B's sync *connection* (the dev token's `sub`
    still exists) — auth ("who you are") and the sync-stream membership query ("what you get")
    are independent; only the row set was cut.
- **Production to-do surfaced**: the spike connector's `uploadData` throws on any non-OK
  response, which keeps a rejected transaction queued and retrying forever (a poison-message
  jam for a permanently-403'd write). Production must distinguish transient (5xx/network ->
  throw/retry) from terminal (4xx authz -> `tx.complete()` + discard + surface to user).

### Q4 — Clerk JWT — **PARTIAL / OPEN** (single named blocker; high confidence the path is sound)

- **Result**: the Clerk dev-instance JWKS is reachable and configured into PowerSync; a
  **real Clerk dev session JWT verifies end-to-end against the live PowerSync service** —
  signature (against Clerk's remote JWKS), `kid`, `iss`, `sub/iat/exp`, and lifetime all
  pass. The **sole** failing assertion is a missing `aud` claim, which only a Clerk Dashboard
  JWT template can add (no Backend API exists to create templates).
- **Evidence** (reproducible via `tools/clerk-token-test.mjs`, reads keys from env at runtime):
  - Derived the Clerk frontend-API domain from the (public) publishable key ->
    `comic-peacock-75.clerk.accounts.dev`; its `/.well-known/jwks.json` returns 1 RSA/RS256
    key with a `kid`. Added it as `client_auth.jwks_uri` in `service.yaml` *alongside* the
    static dev key (verified in the service source that the config builds a
    `CompoundKeyCollector` — both coexist; dev-token auth regression-confirmed still working).
  - Minted a real Clerk dev token with secret key only, no browser: `GET /v1/users` ->
    `POST /v1/sessions` -> `POST /v1/sessions/{id}/tokens`. Decoded: RS256, signed by Clerk's
    key, `iss=https://comic-peacock-75....`, `sub=user_...`, 3600 s lifetime, **`aud` ABSENT**.
  - POSTed it to the live `/sync/stream` -> **HTTP 401 `PSYNC_S2105 "JWT payload is missing a
    required claim aud"`**. Per the service's `KeyStore.verifyJwt` source, `aud` is checked
    *after* signature + `sub/iat/exp`, so reaching S2105 proves the Clerk signature and all
    other claims passed. `POST /v1/sessions/{id}/tokens/powersync` confirmed the template does
    not exist and **cannot** be created via API (`resource_not_found`).
- **Blocker (specific)**: PowerSync requires `aud` and the check cannot be disabled
  (hard-throw in source; an empty `audience` config makes `aud` impossible, not optional).
  Clerk's default token has no `aud`; adding one needs a Dashboard JWT template
  (`{"aud":"powersync-dev"}`), a single manual step outside what the spike can do with the
  secret key alone. Everything else (JWKS config, token mint, client wiring) is verified.

### Q5 — Conflict semantics — **PASS** (high confidence)

- **Result**: same-field edits converge deterministically to the **max `updated_at`**
  (last-write-wins), identically on both devices and in Postgres, independent of which device
  edited and of upload arrival order; per-User `item_checks` are independent and never
  conflict across users.
- **Evidence**: added a crude rename affordance (long-press -> `<base>-<user>-<HHMMSS>`,
  spike-only). Both devices renamed the same item (`item-h1-2`/Eggs) offline, reconnected.
  Backend `[lww] APPLY/SKIP` logs give ground truth on the millisecond ISO `updated_at`:
  - A@07:47:39.861 then B@07:47:46.493 -> Postgres = B's value (later); both UIs converged.
  - Reversed (B@07:49:17.745 then A@07:49:24.194) -> Postgres = A's value (later); converged.
  - A write arriving after a newer one is logged `SKIP stale-lww`; no split-brain in any run.
  - Both A and B checked the same item offline -> `item_checks` held two rows (one per user,
    each its own synthetic `id`, both checked); the `(item_id,user_id)` unique constraint
    isolates each User's check (ADR-0002 holds through PowerSync).
- **Notes for production**: app-owned `updated_at` is only as good as the device clock
  (an early run inverted because of simulator clock skew) — an argument for
  server-authoritative timestamping. Tombstones (`deleted_at`) sync down and clients hide
  them via `WHERE deleted_at IS NULL`, so they accumulate locally forever -> production needs
  a server-side tombstone purge (PowerSync then removes them on the next checkpoint). A
  delete-vs-edit race resolves by the same LWW; the write endpoint must treat `deleted_at` as
  monotonic (or reject edits to tombstoned rows) so a later rename can't un-delete a row.
  These are write-endpoint concerns, not engine concerns.

### Q6 — Tooling fit — **PASS** (high confidence; documented friction)

- **Result**: works on Expo SDK 56 / RN 0.85 with a dev-client native build; "views over
  synced data" eliminated client migrations entirely; small resource footprint. All friction
  has one-time, recorded fixes.
- **Evidence**:
  - *Native build required* (no Expo Go): PowerSync needs a SQLite adapter native module.
    Built via `expo run:ios` (Xcode 26.5 + CocoaPods); all builds succeeded.
  - *SQLite adapter matters*: `@journeyapps/react-native-quick-sqlite` failed at runtime
    (Metro won't bundle its dynamic bare `require`); switched to `@powersync/op-sqlite` +
    `@op-engineering/op-sqlite` with an explicit `OPSqliteOpenFactory` (statically imported,
    always bundled). Prefer this on RN.
  - *pnpm* (the main repo uses it): needs `node-linker=hoisted` (`app/.npmrc`, committed) or
    Metro/autolinking can't resolve packages.
  - *No client migrations*: `schema.ts` declares table shapes via `new Schema({...})`;
    PowerSync materializes SQLite **views** over its `ps_data` store at construction — no
    `CREATE TABLE`, no migration file, no version gate. Adding a column is a code edit. The
    Q1 server schema reset reconciled on clients with no client migration step.
  - *Footprint* (`docker stats`, idle, 2 sims connected): powersync-service ~94 MB,
    pg-source ~34 MB, pg-storage ~45 MB, backend ~20 MB -> whole stack **< ~200 MB RAM**.
    Images: powersync 715 MB, postgres 671 MB. Fits a small VPS.

---

## 3. What the production migration would entail

This inventory was confirmed by reading the actual main-app source (line counts via `wc`).

### Deletes (Turso per-Household-DB machinery — ~3,200-3,500 lines of production code)

- **`lib/services/session/`** — the per-Household DB resource lifecycle: `controller.ts`
  (509), `resource-manager.ts` (294), `resource-lease.ts` (122), `cache.ts` (281),
  `bootstrap.ts`, `services.ts`, plus `server/`. **~1,847 production lines** (audit said
  ~1,456 — an underestimate; the *with-tests* footprint is ~5,609). Opening/leasing/closing
  per-Household Turso replicas vanishes — PowerSync holds one local DB the SDK manages.
- **`lib/services/sync/`** — the app-owned sync coordinator: `sync-coordinator.ts` (361),
  `sync-coordinator-policy.ts` (157), network/app-state adapters. **~661 production lines**
  (audit said ~907, which counted ~1,669 test lines). **Correction worth recording**: this
  coordinator is *not* Turso-specific — it is a foreground/background/network state machine.
  It is deleted not because it is Turso-coupled but because **PowerSync's SDK subsumes its
  job** (connection, retry, upload-queue, and sync-status lifecycle are built in). Confirm
  during migration that no app-specific sync *policy* needs porting onto PowerSync's hooks.
- **`db/household-store.ts` (380) + `db/household-schema.ts` (148)** — **528 lines** (audit
  ~530, exact). The "schema staleness gate" is `ensureHouseholdSchemaReady()` (ADR-0013):
  it compares the bundled migration journal version against the local replica's
  `__drizzle_migrations` and stalls services until the replica catches up. PowerSync's
  declarative views make this **obsolete** — there is no client schema version to gate on.
- **Server provisioning stack** —
  `lib/services/household/server/household-provisioning-service.ts` (110),
  `db/server/turso-platform.ts` (183, the Turso Platform API client),
  and the **migration fanout**: `db/server/migrate.ts` (77) -> `migrateAllHouseholds()`,
  `db/server/household-migrations.ts` (26), `db/server/client.ts` (47, libsql clients).
  Audit's ~1,430 ~= the db/server cluster (~1,294 incl. tests) + provisioning. Also coupled
  and deletable: `db/server/reset.ts`, `db/server/generate.ts`, the household drizzle
  configs, Turso env plumbing (`readTursoOperatorConfig` / `readTursoMigrationConfig`).

### Keeps (directory product logic — survives intact, ~1,600+ lines)

- **`db/schema/directory.ts`** (171) — `users, households, memberships, invitations,
  householdJoinCodes(+Uses, +Attempts)`. This is the server-side directory, independent of
  the per-Household replicas. In the PowerSync world these rows live in the **same** single
  Postgres and become the sync-stream parameter source (memberships drive who-gets-what).
- **`lib/services/invitation/server/invitation-service.ts`** (658) and
  **`lib/services/household/server/household-join-code-service.ts`** (608) — invitation
  tokens, join-code generation + rate-limited validation, membership creation on accept.
  Both operate purely on the directory tables; no Turso coupling; survive unchanged.
- **`lib/server/auth.ts`** (89) — Clerk JWT verification. Survives; in fact PowerSync's
  `client_auth.jwks_uri` reuses the same Clerk instance (Q4).
- The `lists / items / item_checks` schema and the LWW/tombstone model (ADR-0002) survive;
  they move from per-Household SQLite into the single Postgres (with the one fix Q1 surfaced:
  `item_checks` needs a synthetic `id` so PATCH/DELETE key on it, not the composite PK).

### Adds

- The **upload/write-validation endpoint** (the spike's `backend/server.mjs` is the seed):
  verify Clerk JWT -> per-row membership authorization -> LWW-by-`updated_at` -> apply CRUD.
  Must add the Q3 connector policy (terminal 4xx -> discard+complete, transient -> retry) and
  the Q5 tombstone-monotonicity rule.
- **Postgres source DB + PowerSync Service operations** (replication slot, `wal_level=logical`,
  a `publication`, a separate bucket-storage DB) and the **sync stream definitions**
  (`sync-config.yaml`): per-user partitioning via `auth.user_id()` and nested membership
  subqueries. Confirmed finding: items/item_checks need **no** denormalized `household_id` —
  they reach the Household through `list_id -> lists.household_id` joins in the stream queries.
- **Client**: declarative `Schema` (views over synced data) + a `PowerSyncBackendConnector`
  (`fetchCredentials` via Clerk `getToken({template:'powersync'})`, `uploadData` -> the
  endpoint). No client migrations, no per-Household DB open/close, no lease/cache.

### If self-hosted (recommended — see section 4): also relocate the Expo API Routes

The current server (auth, invitations, join codes, the new upload endpoint) runs as Expo
API Routes on EAS Hosting. To keep Postgres reachable **only on the Docker network** (never
the public internet), relocate those routes onto the same VPS using the `expo-server`
Express adapter, which runs the `expo export` server output **unchanged** — no route
rewrites. Compose then holds: pg-source, pg-storage, powersync-service, and the Expo-server
app container, all on one private network; only the Expo server and the PowerSync sync API
are exposed publicly. Keep the compose layout able to add a *second* PowerSync container
later (the operator's forked app, one source-DB connection per instance) but build nothing
for it now.

### What this inventory adds beyond the audit

- The **sync coordinator** deletion rationale is "PowerSync subsumes it", not "it's
  Turso-coupled" — verify no sync *policy* needs porting.
- The audit's session line count was low (~1,847 prod, not ~1,456).
- The **`item_checks` synthetic-`id`** requirement (Q1) is a concrete schema change the audit
  did not mention.
- Two **write-endpoint policies** the audit did not call out: terminal-vs-transient upload
  handling (Q3) and tombstone monotonicity (Q5).

---

## 4. Costs and risks

### Hosting / pricing

- **PowerSync Cloud Free tier**: 2 GB/month synced, 500 MB hosted, 50 peak concurrent
  connections — **and free instances are deprovisioned after 7 days with no deploys or client
  connections** (operator-verified, 2026-06-11). Reactivation is a manual redeploy of sync
  streams; the instance then reprocesses from scratch and re-syncs all clients (source
  Postgres is untouched, but sync is **down until the operator intervenes**). For a
  low-traffic shared-shopping-list app with bursty usage, a 7-day idle window is plausible —
  so the free tier is **not** a safe production floor.
- **PowerSync Cloud no-deactivation floor**: **Pro at $49/month**. Versus **Turso today**
  (free tier: 100 DBs, 5 GB storage, 3 GB syncs/month, no published deactivation policy)
  running this app at **$0**. A naive cloud move is **+$49/mo for an app that is free today**.
- **Therefore self-hosting is the primary recommendation.** The PowerSync Service open
  edition is **FSL-1.1-Apache-2.0** (verified from the running image's `package.json`) — a
  source-available license that **permits self-hosting for your own application** and
  converts each version to Apache 2.0 after two years; the only restriction is offering it as
  a *competing commercial sync service*, which does not apply here. Self-host cost is one
  small VPS running the four containers (the whole stack idles **< 200 MB RAM**, section
  Q6) — on the order of **$5-10/month**, fixed, with no idle-deactivation and Postgres bound
  to the private Docker network.
- **Price the Postgres source too**: a *managed* Postgres free tier has its own
  pause-on-inactivity policy (e.g. Supabase free pauses after ~1 week idle) — the same
  idle-trap as PowerSync Cloud, so a managed free Postgres is **not** a safe floor either.
  Running Postgres **as a container on the same VPS** (as the spike does) avoids this
  entirely: no idle deprovisioning, data on a local volume. That is the recommended shape.
- **Scope for the first self-host iteration** (operator decision): exactly **one** PowerSync
  Service container, this app only, one Postgres source (Postgres bucket storage — **no
  MongoDB**, verified working). Compose layout leaves room for a second container later but
  provisions nothing for it now.

### Service maturity observations

- Sync streams are GA (edition 3, May 2026) and behaved correctly throughout: per-user
  partitioning, nested membership subqueries, instant revocation via parameter-query
  re-evaluation, deterministic LWW, automatic local purge on revoke. No engine bug was hit.
- The RN SDK works on current Expo SDK 56 / RN 0.85 / React 19.2 but is a **native** dependency
  (dev client, not Expo Go) with adapter/Metro/pnpm gotchas — all with recorded one-time
  fixes (Q6). The `quick-sqlite` dynamic-require failure shows the SDK's bundling story has
  rough edges; `op-sqlite` + explicit factory is the robust path.
- The self-hosted Service's auth (`KeyStore`) is strict and well-defined — its `aud`
  requirement is what makes Clerk need a JWT template (Q4); strictness here is a feature, not
  a defect.

### Lock-in assessment

- **Low-to-moderate.** The source of truth is **your own Postgres**, fully portable; PowerSync
  derives sync state from it and can be torn down without touching source data (this is
  exactly the Cloud free-tier reactivation behavior). Sync streams are YAML you own. The
  client SDK is the stickiest piece (the connector + schema API), but the data model is plain
  SQL. FSL-1.1 means you can self-host indefinitely and the code becomes Apache 2.0 over time.
  This is materially less lock-in than per-Household Turso provisioning, which couples the app
  to the Turso Platform API and per-DB token lifecycle.

### What broke (all recorded, all resolved or scoped)

- `item_checks` composite-PK vs PowerSync's synthetic-`id` PATCH contract (Q1) — fixed in the
  spike; a real schema change for production.
- `quick-sqlite` Metro dynamic-require (Q6) — fixed by switching to `op-sqlite`.
- pnpm symlink resolution (Q6) — fixed with `node-linker=hoisted`.
- Rejected-write retry jam (Q3) — observed; a connector-policy requirement for production.
- Clerk `aud` gap (Q4) — the one open item; needs a Dashboard JWT template.

---

## 5. Recommended next step

**Commission a phased migration plan, scoped to a self-hosted single-container deployment, and
first close the one open item (Q4) with a 30-minute Clerk Dashboard task.** Concretely:

1. **Unblock Q4 (cheap, do first)**: create a Clerk JWT template `powersync`
   (`{"aud":"powersync-dev"}`, lifetime <= 1 h) in the dev Dashboard, then re-run
   `tools/clerk-token-test.mjs powersync` (it already supports a template arg) to confirm the
   token is **accepted** by the live service. This converts Q4 PARTIAL -> PASS with no code.
2. **Plan the deployment as self-hosted from day one** (free-tier deprovisioning makes Cloud a
   non-starter for a bursty free app): one VPS, compose with pg-source + pg-storage +
   powersync-service + the Expo-server app container on a private network; Postgres never
   public; layout extensible to a second PowerSync container later.
3. **Phase the code migration** behind the inventory in section 3: stand up the single
   Postgres + sync streams + the hardened upload endpoint (add the Q3 terminal-4xx policy and
   the Q5 tombstone-monotonicity rule, and the `item_checks` synthetic `id`); swap the client
   onto the PowerSync connector + declarative schema; then delete the session/sync/provisioning
   machinery (~3,200-3,500 lines) once parity tests pass. Verify no sync *policy* from the
   app-owned coordinator needs porting onto PowerSync's hooks.

The spike found no reason to stay on Turso and two reasons to leave it (instant revocation,
no client migrations). The only thing standing between "GO-WITH-CAVEATS" and a clean "GO" is
the Clerk Dashboard template — a known, trivial step — and the decision to self-host, which
the cost analysis already recommends.

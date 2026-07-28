# Server-authoritative product write ordering

This ADR records the plan-031 spike decision and commissions the follow-on build
in `plans/044-server-authoritative-product-write-ordering.md`. It is not a
product-write implementation.

## Decision

ADR-0018 shipped the PowerSync cut-over with app-owned `updated_at`
last-write-wins as bounded MVP debt. The one-User, one-primary-device scope
removes competing clocks from the same User's write stream, but it does not
remove competing clocks from shared product rows: multi-Member Households already
let different Members write the same Lists, Items, and `item_checks` rows from
different devices.

Keep device-clock LWW for the current MVP, with that limitation accepted. Before
supporting one User on multiple devices, and before hardening multi-Member
conflict correctness, product write ordering must move to a server-owned
monotonic sequence.

When plan 044 lands, `updated_at` remains client-authored action/display time,
but it stops being the product conflict-ordering authority. Add a server-owned
sequence column to `lists`, `items`, and `item_checks`; stamp it in `/api/data`
as uploaded operations are accepted; and make that sequence the sole product
conflict-ordering / LWW authority in the applicator and Postgres transaction
layer.

The sequence mechanism must be idempotent under PowerSync upload retries. The
client upload contract must carry a stable client operation identity, such as
PowerSync `CrudEntry.clientId` plus `transactionId` and any stable client/database
identity needed to scope them. The server must keep a per-client applied-op
ledger or op-to-sequence mapping in the same transaction as the product write.
If a commit succeeds but the response is lost, a retry of the same local
transaction must reuse the original sequence or no-op; it must never receive a
fresh higher sequence that could clobber a genuinely newer write from another
device.

## Context

### Current state

The live code was re-verified on 2026-07-07:

- `src/server/sync/applicator.ts` still compares incoming client `updated_at`
  with the stored row and uses `clampUpdatedAt` only to cap future client
  timestamps at upload time. It never stamps server time.
- `src/server/sync/pg-transaction.ts` still uses SQL `updated_at <= ...` guards
  in `patch`, `tombstone`, `uncheckItemCheck`, and the `item_checks`
  `ON CONFLICT (item_id)` update path.
- `src/server/db/schema/postgres/sync-columns.ts` has explicit
  `CLIENT_WRITABLE` and `SERVER_OWNED` declarations. `SERVER_OWNED` is empty,
  and `updated_at` is client-writable for all product tables.
- `src/client/features/item/item-service.ts` and
  `src/client/features/list/list-service.ts` still stamp product `updated_at`
  from the device clock via `Date.now()` and local monotonic helpers.
- `infra/powersync/sync-config.yaml` streams `SELECT *` from `lists`, `items`,
  and `item_checks` to every active Member whose Membership grants access to the
  owning Household. The `powersync` publication is table-level, with no column
  list.
- `src/client/session/powersync/connector.ts` uploads only `{ op, table, id,
  data }` to `/api/data`; it currently drops the stable PowerSync CRUD operation
  fields available on `@powersync/common` `CrudEntry`.

That means one-User-one-primary-device removes only same-User competing device
clocks. Multi-Member Households already create competing device clocks on shared
product rows today. `item_checks` is one shared row per Item, so a check and
uncheck from different Members race on the same row. The current LWW guard then
compares the two Members' client-authored `updated_at` values.

A correct skew failure does not require a future timestamp to survive the clamp.
For example: Member A checks an Item. One minute later in real time, Member B
unchecks the same Item, but B's device clock runs two minutes slow. B uploads
with an `updated_at` older than A's stored row, so the genuinely newer uncheck is
silently skipped. A far-future client clock is capped at upload time, but the
clamp is one-sided and does not make different device clocks comparable.

This is accepted, bounded MVP debt. The common shared-row conflict is an
`item_checks` toggle, which is user-recoverable; List deletes are soft-delete
tombstones, not hard deletes; and a conflict requires a same-row cross-Member
race within the clock-skew window.

### PowerSync research

- PowerSync says local writes are automatically queued and uploaded through the
  app's `uploadData()` backend connector; the backend controls how they are
  applied to the source database.
- The client upload queue records `PUT`, `PATCH`, and `DELETE` operations,
  grouped per client-side transaction.
- `uploadData()` runs in a loop until the queue is empty. The docs describe the
  queue as blocking FIFO, and say offline writes accumulate until connectivity
  returns.
- PowerSync's default conflict behavior is effectively "last write wins" as
  received/processed by the server, but conflict handling is the app backend's
  responsibility.
- PowerSync's custom-conflict examples call out client timestamp conflict
  detection as vulnerable to clock drift, and also document sequence-number
  versioning as an alternative strategy for critical conflict checks.
- PowerSync recommends synchronous write endpoints against the source database.
  Asynchronous backend queues can cause the client to advance checkpoints without
  seeing its uploaded writes, which produces visible rollback/reapply behavior.
- PowerSync recommends not blocking the upload queue for expected
  validation/write conflicts. Conflicts that are accepted/discarded by the server
  should be acknowledged; transient infrastructure failures should retry.

Sources:

- <https://docs.powersync.com/handling-writes/writing-client-changes>
- <https://docs.powersync.com/handling-writes/handling-update-conflicts>
- <https://docs.powersync.com/handling-writes/custom-conflict-resolution>
- <https://docs.powersync.com/configuration/app-backend/client-side-integration>
- <https://docs.powersync.com/architecture/consistency>
- <https://docs.powersync.com/handling-writes/handling-write-validation-errors>

### Interaction analysis

1. Is server-authoritative ordering needed?

   Not to finish the current bounded MVP, but yes before same-User multi-device
   support and before hardening multi-Member conflict correctness. Device-clock
   LWW is deterministic within one device's local write stream. Across devices,
   including different Members in the same Household, skewed clocks can silently
   reorder writes.

2. Which mechanism?

   Use a server-owned monotonic sequence column, not server-assigned `updated_at`
   and not a tighter client-clock clamp.

   A sequence is the cleanest single source of truth for write ordering: every
   accepted product operation receives one server order value, and LWW compares
   only that value. It has no timestamp ties, no database-clock precision
   concern, and no device-clock trust. A separate sequence also avoids changing
   the user-facing meaning of `updated_at`: delayed offline writes can still
   carry the time the User acted, while conflict order is the time the server
   accepted the write.

   Replacing `updated_at` with server time would also remove device-clock trust,
   but it would conflate action time, display/activity time, and upload time.
   Offline edits uploaded much later would appear as fresh edits even when the
   User acted earlier. Tightened clamp or bounded skew tolerance still leaves
   ordering dependent on device clocks, so it does not satisfy the
   single-source-of-truth mandate.

3. How does it interact with the current write path?

   PowerSync upload model: the plan is compatible only if the upload contract is
   made idempotent. PowerSync groups local SQL writes by client transaction and
   uploads the FIFO queue through `uploadData()`. `/api/data` already applies
   each uploaded batch inside one Postgres transaction. The follow-on build must
   assign or recover one server sequence value per stable product operation in
   batch order, then use that value in the JavaScript skip and SQL guards. This
   preserves per-device local ordering and makes cross-device order
   server-receipt order.

   Existing SQL and JavaScript LWW: the `updated_at <= ...` guards must be
   replaced with server-sequence guards. The JavaScript applicator skip should
   compare the assigned incoming sequence against the stored row's sequence; the
   SQL layer must also guard on the sequence to preserve correctness under
   concurrent `READ COMMITTED` uploads.

   Connector terminal/transient contract: unchanged. A stale or losing LWW
   operation is an accepted no-op and should still return success so the
   PowerSync FIFO queue advances. Terminal statuses remain `{400, 403, 409,
   413}` for malformed writes, authorization failures, impossible resurrection,
   and payload limits. Network failures, 5xx, 401, and 429 retry; 401 is
   deliberately non-terminal because the connector fetches a fresh session token
   on each attempt, and 429 is rate limiting.

   `item_checks`: the `ON CONFLICT (item_id)` merge remains the right shape. The
   conflict update should stamp and guard with the server sequence, not
   `updated_at`. The uncheck path still updates the existing row by setting
   `checked_at` and `checked_by_user_id` to `NULL`; under receipt-order
   semantics, it can lose only to an already-assigned higher sequence from a
   retry/concurrent interleaving, not as general stale-action protection.

4. What would a build require?

   The follow-on build needs these coordinated product-schema edit points:

   - Postgres/Drizzle/migration: add a server-owned sequence and non-null
     ordering column to `lists`, `items`, and `item_checks`, with a backfill for
     existing rows.
   - Client `AppSchema`: add the sequence column to the product tables so the
     declarative local schema matches the streamed rows.
   - Schema consistency test: prove the Postgres schema, client `AppSchema`,
     product `SELECT *` streams, and table-level publication remain aligned.

   Because the product streams are `SELECT *` and the publication is table-level,
   the new column streams automatically; there is no product stream projection
   list to update.

   It also needs `/api/data` write-path edits: include stable client operation
   identity in the connector upload payload; persist a per-client applied-op
   ledger or op-to-sequence mapping; classify the new column as `SERVER_OWNED` in
   `sync-columns.ts`; generate/stamp sequence values in `pg-transaction.ts`;
   replace `updated_at` LWW checks in the applicator and SQL guards; and extend
   tests for receipt-order writes, retry idempotency, concurrent writes,
   `item_checks` upsert/uncheck, schema consistency, and migration application.

## Considered alternatives

- **Keep device-clock LWW with a tighter clamp.** Rejected for multi-device and
  stronger multi-Member correctness because the server still trusts client clocks
  for ordering. It can reject extreme skew but cannot correctly order two
  plausible but skewed device clocks.
- **Use server-assigned `updated_at` as the ordering clock.** Rejected because it
  collapses display/activity time into upload time and still does not provide as
  clean a total order as a sequence under concurrent writes.
- **Assign a fresh sequence on every upload attempt.** Rejected because PowerSync
  retries the same queued transaction after network/5xx/401/429 failures. A
  commit-succeeded/response-lost retry would be restamped with a higher sequence
  and could overwrite a genuinely newer write from another device.
- **Require a blocking pre-action sync barrier.** Rejected by repo mandate. Local
  product writes must commit immediately and upload in the background.
- **Loosen terminal-status discard.** Rejected. A conflict-ordering change must
  not make deterministic poison-pill writes block the FIFO upload queue.

## Consequences

- Device-clock LWW remains accepted only as bounded MVP debt. It is not correct
  cross-device ordering; it is tolerated because likely conflicts are
  user-recoverable, soft-deleted, and limited to same-row cross-Member races
  within the clock-skew window.
- Plan 044, or an equivalent server-sequence build, is required before same-User
  multi-device support and before hardening multi-Member conflict correctness.
- **Delete-beats-newer-edit:** server sequence means server-receipt order. This
  deliberately inverts the current stale-action invariant: a week-old offline
  delete uploaded today receives a higher sequence than yesterday's edit and
  soft-deletes the row. Stale offline action protection does not survive this
  decision.
- `updated_at` remains useful as client-authored action/display time, but it is
  no longer the authority for product write ordering once the follow-on build
  lands.
- The app's PowerSync write endpoint remains synchronous, local-first, and
  background-uploaded; no service or screen waits for remote propagation before
  reporting mutation success.

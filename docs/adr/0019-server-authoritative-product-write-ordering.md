# Server-authoritative product write ordering

ADR-0018 intentionally shipped the PowerSync cut-over as a one-User, one-primary-device MVP. In that scope, product write ordering by app-owned `updated_at` is acceptable: one device produces the local write stream, the client services generate monotonic millisecond timestamps within that process, and there is no second device clock competing with it.

Before the app supports one User on multiple devices, product write ordering must move to a server-owned monotonic sequence. Keep `updated_at` as client-authored action/display time, but stop using it as the conflict-ordering authority. Add a server-owned sequence column to `lists`, `items`, and `item_checks`; stamp it in `/api/data` as each uploaded operation is applied; and use it as the last-write-wins guard and tie-break in the applicator and Postgres transaction layer.

This is not a product-write implementation. It records the spike decision and commissions the follow-on build in `plans/044-server-authoritative-product-write-ordering.md`.

## Current-state reconciliation

Plan 031 was written against pre-restructure paths. The live equivalents were checked on 2026-07-07:

- `db/server/sync/applicator.ts` is now `src/server/sync/applicator.ts`. The JavaScript LWW skip still compares incoming client `updated_at` with the stored row, and `clampUpdatedAt` still only clamps future client timestamps down to `Date.now()`. It never stamps server time.
- `db/server/sync/pg-transaction.ts` is now `src/server/sync/pg-transaction.ts`. `patch`, `tombstone`, `uncheckItemCheck`, and the `item_checks` upsert path still use SQL `updated_at <= ...` guards and never assign `now()` or another server-owned order value.
- `db/schema/postgres/sync-columns.ts` is now `src/server/db/schema/postgres/sync-columns.ts`. The plan's "empty EXCLUDE allow-by-default" fact has changed: plan 039 replaced it with explicit `CLIENT_WRITABLE` and `SERVER_OWNED` declarations. The relevant fact still holds in the new model: `SERVER_OWNED` is empty and `updated_at` remains client-writable for all product tables.
- `lib/services/item/item-service.ts` and `lib/services/list/list-service.ts` are now `src/client/features/list/item-service.ts` and `src/client/features/list/list-service.ts`. Both services still stamp `updated_at` from the device clock via `Date.now()` and local monotonic helpers.

The reconciled drift check was:

```bash
git diff --stat c87c968e..HEAD -- src/server/sync src/server/db/schema/postgres src/client/features/list
```

It is not clean because plans 029, 030, 032-043 moved and added the post-restructure source tree. The specific behavioral facts above were re-verified against live code.

## PowerSync research

Context7 was attempted first, per repo instructions, with the full PowerSync question. The CLI produced no output for over a minute in this restricted environment and was interrupted. The spike then used only official PowerSync documentation:

- PowerSync says local writes are automatically queued and uploaded through the app's `uploadData()` backend connector; the backend controls how they are applied to the source database.
- The client upload queue records `PUT`, `PATCH`, and `DELETE` operations, grouped per client-side transaction.
- `uploadData()` runs in a loop until the queue is empty. The docs describe the queue as blocking FIFO, and say offline writes accumulate until connectivity returns.
- PowerSync's default conflict behavior is effectively "last write wins" as received/processed by the server, but conflict handling is the app backend's responsibility.
- PowerSync's custom-conflict examples call out client timestamp conflict detection as vulnerable to clock drift, and also document sequence-number versioning as an alternative strategy for critical conflict checks.
- PowerSync recommends synchronous write endpoints against the source database. Asynchronous backend queues can cause the client to advance checkpoints without seeing its uploaded writes, which produces visible rollback/reapply behavior.
- PowerSync recommends not blocking the upload queue for expected validation/write conflicts. Conflicts that are accepted/discarded by the server should be acknowledged; transient infrastructure failures should retry.

Sources:

- <https://docs.powersync.com/handling-writes/writing-client-changes>
- <https://docs.powersync.com/handling-writes/handling-update-conflicts>
- <https://docs.powersync.com/handling-writes/custom-conflict-resolution>
- <https://docs.powersync.com/configuration/app-backend/client-side-integration>
- <https://docs.powersync.com/architecture/consistency>
- <https://docs.powersync.com/handling-writes/handling-write-validation-errors>

## Decision questions

1. Is server-authoritative ordering needed?

Not for the ADR-0018 one-User, one-primary-device MVP. Yes before multi-device support. Device-clock LWW is deterministic on one device, but across devices it lets skewed clocks silently reorder writes. A one-sided future clamp only prevents a far-future timestamp from pinning a row forever; it does not make clocks comparable across devices.

2. Which mechanism?

Use a server-owned monotonic sequence column, not server-assigned `updated_at` and not a tighter client-clock clamp.

A sequence is the cleanest single source of truth for write ordering: every accepted product operation receives one server order value, and LWW compares only that value. It has no timestamp ties, no database-clock precision concern, and no device-clock trust. A separate sequence also avoids changing the user-facing meaning of `updated_at`: delayed offline writes can still carry the time the User acted, while conflict order is the time the server accepted the write.

Replacing `updated_at` with server time would also remove device-clock trust, but it would conflate action time, display/activity time, and upload time. Offline edits uploaded much later would appear as fresh edits even when the User acted earlier. Tightened clamp or bounded skew tolerance still leaves ordering dependent on device clocks, so it does not satisfy the single-source-of-truth mandate.

3. How does it interact with the current write path?

PowerSync upload model: the plan is compatible. PowerSync groups local SQL writes by client transaction and uploads the FIFO queue through `uploadData()`. `/api/data` already applies each uploaded batch inside one Postgres transaction. The follow-on build should assign one server sequence value per product operation in batch order, then use that value in the JavaScript skip and SQL guards. This preserves per-device local ordering and makes cross-device order server-receipt order.

Existing SQL and JavaScript LWW: the `updated_at <= ...` guards must be replaced with server-sequence guards. The JavaScript applicator skip should compare the assigned incoming sequence against the stored row's sequence; the SQL layer must also guard on the sequence to preserve correctness under concurrent `READ COMMITTED` uploads.

Connector terminal/transient contract: unchanged. A stale or losing LWW operation is an accepted no-op and should still return success so the PowerSync FIFO queue advances. Terminal 400/403/409/413 behavior remains for malformed writes, authorization failures, impossible resurrection, and payload limits. Transient 5xx/network failures continue to retry. The mechanism must not loosen terminal-status discard or introduce a blocking pre-action sync barrier.

`item_checks`: the `ON CONFLICT (item_id)` merge remains the right shape. The conflict update should stamp and guard with the server sequence, not `updated_at`. The uncheck path still updates the existing row by setting `checked_at` and `checked_by_user_id` to `NULL`; it should stamp the server sequence and lose to any already-committed row with a higher sequence.

Offline edits uploaded much later: with a server sequence, late uploads are ordered when the server accepts them, not when the device originally acted. That is an explicit product trade-off. It is preferable to trusting unauditable device clocks because there is no reliable cross-device action-time source without adding pre-action synchronization, which the repo explicitly rejects.

4. What would a build require?

The follow-on build needs the three coordinated product-schema edit points from `docs/guides/adding-database-migration.md`:

- Postgres/Drizzle/migration: add a server-owned sequence and non-null ordering column to `lists`, `items`, and `item_checks`, with a backfill for existing rows.
- PowerSync sync config/publication: keep the product tables in the `powersync` publication and update product sync stream projections so the sequence column is part of the streamed row contract.
- Client `AppSchema`: add the sequence column to the product tables so the declarative local schema matches the streamed rows.

It also needs `/api/data` write-path edits: classify the new column as `SERVER_OWNED` in `sync-columns.ts`; generate/stamp sequence values in `pg-transaction.ts`; replace `updated_at` LWW checks in the applicator and SQL guards; and extend tests for stale writes, concurrent writes, `item_checks` upsert/uncheck, schema consistency, and migration application.

## Rejected options

- **Keep device-clock LWW with a tighter clamp.** Rejected for multi-device because the server still trusts client clocks for ordering. It can reject extreme skew but cannot correctly order two plausible but skewed device clocks.
- **Use server-assigned `updated_at` as the ordering clock.** Rejected because it collapses display/activity time into upload time and still does not provide as clean a total order as a sequence under concurrent writes.
- **Require a blocking pre-action sync barrier.** Rejected by repo mandate. Local product writes must commit immediately and upload in the background.
- **Loosen terminal-status discard.** Rejected. A conflict-ordering change must not make deterministic poison-pill writes block the FIFO upload queue.

## Consequences

- Device-clock LWW remains acceptable only for the current one-primary-device MVP.
- Multi-device support should not ship until plan 044 or an equivalent server-sequence build lands.
- `updated_at` remains useful as client-authored action/display time, but it is no longer the authority for product write ordering once the follow-on build lands.
- The app's PowerSync write endpoint remains synchronous, local-first, and background-uploaded; no service or screen waits for remote propagation before reporting mutation success.

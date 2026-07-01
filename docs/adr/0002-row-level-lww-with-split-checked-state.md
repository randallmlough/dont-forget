# App-owned ordering with `checked` state split into its own table

_Checked-state data model superseded by [ADR-0015](0015-shared-per-item-check-with-attribution.md): on the Postgres + PowerSync substrate, `checked` is a single shared row per Item (synthetic `id` PK, `UNIQUE(item_id)`, `checked_by_user_id`) rather than per-`(item_id, user_id)`. The split-table isolation, app-owned `updated_at` ordering, and tombstone rationale below remain in force._

_Transport superseded by [ADR-0018](0018-single-postgres-self-hosted-powersync.md) (2026-06-30): the "last-push-wins" transport described below was Turso Sync's. Under Postgres + PowerSync, concurrent writes are resolved by app-owned `updated_at` last-writer-wins in the `/api/data` applicator (for `item_checks`, an `updated_at`-guarded upsert conflicting on `item_id`). The split-table isolation and app-owned `updated_at` ordering below remain in force._

Concurrent edits to the same Item row can still lose data under Turso Sync's documented **last-push-wins** transport behavior (e.g., Bob checks "milk" while Alice renames it; the later push can determine what remote state wins for overlapping row changes). We split the `checked` state into a separate `item_checks` table keyed by `(item_id, user_id)` because checking off Items is by far the highest-collision field. App writes maintain app-owned `updated_at` timestamps for ordering, latest checked-state display, recovery upserts, and future migration paths; these timestamps are not Turso's merge clock. Cross-device clock skew is acceptable for Household List data. All replicated tables use **tombstone-based soft-delete** (`deleted_at`) so app delete paths can sync and be reasoned about without hard deletes.

## Considered alternatives

- **Column-level custom merge** (per-column `_updated_at`, custom merge layer). Rejected: Turso Sync does not provide this as the app's default conflict strategy; the merge layer is significant complexity for a collision rate that, outside `checked`, is vanishingly rare on shopping-list data.
- **Append-only event log.** Rejected: heaviest design shift, would change every read path. Reconsider only if "edit history" or "undo" become first-class features.

## Consequences

- The `items` table holds durable attributes only (`name`, freeform `quantity`, `notes`, `position`, `deleted_at`). Two Members editing those simultaneously can lose one edit — acceptable in practice for shopping-list use.
- The visible checked state is derived from the newest `item_checks.updated_at` row for the Item across Users in the Household. If that row has non-null `checked_at`, the Item is checked; if it has null `checked_at`, the Item is unchecked. Each User only upserts their own `(item_id, user_id)` row.
- App writes should use service-owned timestamp generation rather than scattering timestamp calls through screens or components, so app-owned timestamps remain consistent for display and recovery behavior.
- Per-User check state enables a free "X added this to the cart" UX hint.
- Tombstoned rows must be GC'd server-side (cron, ≥30 days old, after replicas have caught up) to keep DBs from growing unbounded.
- No hard deletes from the app — every delete path writes `deleted_at` instead.

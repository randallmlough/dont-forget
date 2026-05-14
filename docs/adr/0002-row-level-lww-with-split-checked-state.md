# Row-level last-write-wins with `checked` state split into its own table

Concurrent edits to the same Item row could lose data under naive row-level LWW (e.g., Bob checks "milk" while Alice renames it; one of the two writes is silently overwritten). We chose **row-level LWW** as the base merge strategy because it's what libSQL's replication gives us natively, and we **split the `checked` state into a separate `item_checks` table** keyed by `(item_id, member_id)` because checking off items is by far the highest-collision field. All replicated tables use **tombstone-based soft-delete** (`deleted_at`) so concurrent delete + edit resolves correctly under LWW.

## Considered alternatives

- **Column-level LWW** (per-column `_updated_at`, custom merge layer). Rejected: libSQL doesn't support it natively; the merge layer is significant complexity for a collision rate that, outside `checked`, is vanishingly rare on shopping-list data.
- **Append-only event log.** Rejected: heaviest design shift, would change every read path. Reconsider only if "edit history" or "undo" become first-class features.

## Consequences

- The `items` table holds durable attributes only (`name`, `notes`, `position`, `deleted_at`). Two Members editing those simultaneously can lose one edit — acceptable in practice for shopping-list use.
- The visible checked state is derived from the newest `item_checks.updated_at` row for the Item across Members. If that row has non-null `checked_at`, the Item is checked; if it has null `checked_at`, the Item is unchecked. Each Member only upserts their own `(item_id, clerk_user_id)` row.
- Per-Member check state enables a free "X added this to the cart" UX hint.
- Tombstoned rows must be GC'd server-side (cron, ≥30 days old, after replicas have caught up) to keep DBs from growing unbounded.
- No hard deletes from the app — every delete path writes `deleted_at` instead.

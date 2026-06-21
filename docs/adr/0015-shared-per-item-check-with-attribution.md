# Shared per-Item checked state with attribution

ADR-0002 split `checked` into its own `item_checks` table keyed by `(item_id, user_id)` so the highest-collision field was isolated from Item attribute edits, and derived the visible checked state from the newest per-User row. That per-User model fit the Turso last-push-wins transport, where each Member upserts only their own `(item_id, user_id)` row and the app reduces across rows for display.

The Postgres + self-hosted PowerSync target (the Turso -> Postgres replatform, "PR-A") changes the substrate. PowerSync addresses rows by a single synthetic `id` and emits PATCH/DELETE keyed on that `id`; there is no composite-key write path. Modeling checked state as one row per `(item_id, user_id)` would force the client connector and the `/api/data` applicator to synthesize and reconcile per-User rows against a single-`id` write protocol, and the "newest row across Users" read reduction would have to run on every Item render. Checked state is a single shared fact per Item ("is this on the cart"), not a per-User fact; the only per-User information worth keeping is *who* last changed it, for the "X added this" hint.

## Decision

We will model checked state as a single shared row per Item in Postgres ("Decision 9"):

- `item_checks` has a synthetic `id` primary key (the PowerSync PATCH/DELETE key) and a `UNIQUE(item_id)` constraint enforcing exactly one row per Item.
- `checked_by_user_id` records attribution: the User who last set the checked state. This preserves the "X added this to the cart" hint without a per-User row.
- `checked_at IS NULL` means unchecked. Uncheck NULLs `checked_at` and `checked_by_user_id` on the existing row rather than deleting it, so the synthetic `id` and `item_id` survive for sync and future LWW comparison.
- App-owned `updated_at` remains the application-level last-writer-wins clock for the row. Because two Members can produce different synthetic `id`s for the same `item_id`, the server applicator conflicts on `item_id` (not `id`) and merges by `updated_at`, so a stale check/uncheck loses to a newer one.

This is the authoritative checked-state data model for the Postgres substrate. It is already reflected in the Postgres schema (`db/schema/postgres/product.ts`) and enforced by the `/api/data` write applicator (`db/server/sync/`; relocated there by [ADR-0016](0016-data-write-applicator-in-db-layer.md)).

## Considered options

- **Keep the per-User `(item_id, user_id)` split table (ADR-0002, status quo).** Rejected for the Postgres target: it has no single-`id` write key for PowerSync, forces per-User row reconciliation in the connector and applicator, and pushes a "newest row across Users" reduction into every read. The collision-isolation rationale (a dedicated `item_checks` table, app-owned `updated_at`, tombstone discipline) still holds and is retained — only the per-User cardinality is replaced.
- **A boolean `checked`/`checked_by` column on `items`.** Rejected: it re-merges the highest-collision field back into Item attribute edits, the exact coupling ADR-0002 separated. A dedicated row keeps the high-churn checked write off the Item attribute row.
- **Conflict on the synthetic `id` like every other table.** Rejected: two Members checking the same Item offline generate distinct `id`s with the same `item_id`; an `id` conflict would never fire, the `UNIQUE(item_id)` constraint would raise, and the write would 500 and retry forever. Conflicting on `item_id` with an `updated_at` guard makes concurrent checks last-writer-wins.

## Consequences

- ADR-0002 is **superseded for the checked-state data model**: checked state is one shared row per Item with attribution, not per-User. ADR-0002's split-table isolation, app-owned `updated_at` ordering, and tombstone-based soft-delete rationale remain valid and in force; only its `(item_id, user_id)` cardinality and "newest row across Users" derivation are replaced.
- The "X added this" UX hint is now derived from `checked_by_user_id` on the single shared row instead of from a per-User row, so it reflects the last Member to change the state rather than each Member independently.
- **Tracked follow-on (later PR):** the libSQL app side has not migrated yet. `db/schema/household.ts` still defines `item_checks` with a `(item_id, user_id)` primary key, and `lib/services/item/item-service.ts` still reads/writes the per-User shape. Both must move to the single-row-per-Item model (synthetic `id` PK, `UNIQUE(item_id)`, `checked_by_user_id`, uncheck-NULLs-columns) in a later slice of the migration. Until then, CONTEXT.md describes the target shared-per-Item model while the app still runs the per-User libSQL schema.

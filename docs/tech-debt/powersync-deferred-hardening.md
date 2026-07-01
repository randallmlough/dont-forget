# PowerSync deferred hardening

## Context

The PowerSync migration ([ADR-0018](../adr/0018-single-postgres-self-hosted-powersync.md)) shipped as a
single-device MVP with a clean cut-over. Several hardening items were consciously deferred at cut-over —
four settled during the migration design (the "Fast Follow" list, Decisions 7 and 8) and two surfaced by
the PR-C2 review (PR #134). They are recorded here so they are not lost.

## Why This Is Debt

Each item is a known gap that is acceptable for a single-device MVP with no real users but should be
addressed before the app hardens for production or multi-device use. None is load-bearing today; all are
deliberate trades, not oversights.

## Deferred items

1. **Server-authoritative timestamping for product writes.** Replace app-owned `updated_at` with a
   server-assigned write time. Only matters for cross-device LWW precision, which the single-device MVP
   does not exercise. (Decision 8.)
2. **Request rate-limiting / payload-size / batch-size caps on `/api/data`.** The write endpoint has no
   abuse guards yet. (Decision 8.)
3. **Join-code abuse protection.** The failed-attempt throttle was removed in PR-C1; code entropy
   (`2^40`) is the mitigation. Revisit only if the join-code length/alphabet is ever reduced. (Decision 7.)
4. **Strengthen invitation-reuse to a partial unique index** (`household_id`, normalized email, pending)
   if duplicate pending Invitations ever appear; the explicit lock was dropped for MVP. (Decision 7.)
5. **Drain queued local writes before leaving / being removed from a Household.** Once `leaveHousehold`
   sets `memberships.removed_at`, queued PowerSync CRUD for that Household 403s at `/api/data` (the
   `isActiveMember` check) and the connector treats 403 as terminal and discards it, so still-unsynced
   List/Item edits are lost. PR-C2 removed the old pre-leave sync barrier. A correct fix needs an
   upload-queue-drained signal (`getUploadQueueStats` / `getNextCrudTransaction`) plumbed through the
   session plus a bounded, offline-safe drain-before-leave gate — and must not reintroduce a blocking
   pre-action barrier. (PR #134 review: discussion r3496682829.)
6. **Offline cold-start session restoration.** The cold-start hint now persists only a boolean, so a
   signed-in User opening the app offline hits the generic error state (`bootstrap.getSession` needs the
   network) instead of reopening the last Household/List from local PowerSync data. Needs the
   directory-identity bootstrap payload re-persisted and read on activation failure. Intentionally
   dropped by PR-C2 (maximum debt removal). (PR #134 review: discussion r3496488837.)

## Revisit When

- Before the app supports a User on more than one device: items 1 and 6.
- Before opening `/api/data` to real users or untrusted traffic: items 2 and 3.
- If duplicate pending Invitations are observed in practice: item 4.
- Before Member leave/removal becomes a common, data-loss-sensitive flow: item 5.

## Desired Direction

Address each item as a focused follow-up, smallest-first. Items 2–4 are small server-side guards. Items
1, 5, and 6 touch the sync/session plumbing and should be designed together with the multi-device story,
since that is what makes them matter. None should reintroduce a blocking pre-action sync barrier
(Decision 4 removed the pre-switch barrier deliberately).

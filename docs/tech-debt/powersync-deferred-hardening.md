# PowerSync deferred hardening

## Context

The PowerSync migration (PR-A → PR-C2) ships the single-device MVP: product data
on Postgres + self-hosted PowerSync, a server-validated `/api/data` write path,
and the irreversible Turso deletion. Several hardening items were deliberately
**deferred** rather than built into those PRs — either accepted tradeoffs for the
single-device MVP (migration discussion Decisions 7/8) or scope that belongs to a
later PR.

This doc is the backlog the plan (`plans/024` / PR-D) designates as the home for
those items. Items 1–4 are the Fast-Follow list from the migration discussion;
items 5–6 were surfaced by the **PR-C2 v2 review (PR #134)** and deferred there
with rationale. PR-D finalizes this doc as part of the documentation cutover.

## Why This Is Debt

Each item is a known gap accepted for now. None blocks the MVP, but each is a real
correctness/operability concern under multi-device use, misconfiguration, or
offline edges:

1. **Server-authoritative timestamping for product writes.** Writes carry an
   app-owned `updated_at`; LWW precision across devices depends on client clocks.
   Irrelevant single-device, matters for cross-device conflict resolution.
2. **`/api/data` rate-limiting / payload-size / batch-size caps.** The write
   endpoint has no abuse/DoS guards.
3. **Join-code abuse protection.** Current entropy (~2⁴⁰) is adequate; brute-force
   protection is unbuilt.
4. **Invitation-reuse partial unique index.** Duplicate pending Invitations are
   possible without a `(household_id, normalized email, pending)` partial unique
   index.
5. **Drain queued writes before leaving / being removed from a Household.**
   Once `leaveHousehold` sets `memberships.removed_at`, still-queued PowerSync
   CRUD for that Household is rejected with 403 at `/api/data` (the
   `isActiveMember` check), and the connector treats 403 as terminal and
   discards the transaction — so local List/Item edits made just before leaving
   can be lost. PR-C2 removed the old pre-leave sync barrier (Decision 4 removed
   the pre-*switch* barrier; the leave barrier fell out with `requestSync`). The
   403-as-terminal discard is intentional connector behavior (Decision 8).
   Surfaced in PR #134 review (discussion r3496682829).
6. **Offline cold-start session restoration.** The cold-start gate now persists
   only a boolean hint, so a signed-in User opening the app offline reaches the
   generic error state (the directory bootstrap needs the network) instead of
   reopening the last Household/List from the local PowerSync data. The deleted
   bootstrap cache used to restore this from a persisted snapshot. Intentionally
   dropped by PR-C2 (Decision 2, maximum debt removal; Step 14 sanctioned the
   boolean hint). Surfaced in PR #134 review (discussion r3496488837).

   *(Related, tracked elsewhere: early validation of `EXPO_PUBLIC_POWERSYNC_URL`
   for staging/production builds is owned by PR-E's env cutover — `plans/025`,
   PR #134 discussion r3496594954 — not this doc.)*

## Revisit When

1. Cross-device editing of the same Household ships, or LWW anomalies appear.
2. `/api/data` is exposed to untrusted load, or abuse is observed.
3. Join-code length/alphabet shrinks below current entropy.
4. Duplicate pending Invitations are observed in practice.
5. Multi-device usage is real and a User reports losing edits made right before
   leaving/being removed from a Household.
6. Offline launch of a returning signed-in User becomes a supported requirement
   (e.g. flaky-connectivity field reports).

## Desired Direction

1. Stamp `updated_at` server-side in the `/api/data` applicator; keep app-owned
   timestamps only as a fallback.
2. Add per-User/route rate limits + payload/batch caps at the `/api/data`
   boundary.
3. Add join-code attempt throttling if entropy is reduced.
4. Add the partial unique index on Invitations.
5. Surface an upload-queue-drained signal (`getUploadQueueStats` /
   `getNextCrudTransaction`) through the session and add a **bounded,
   offline-safe** drain-before-leave gate — without reintroducing a blocking
   pre-action barrier (Decisions 4 & 5).
6. Re-persist the directory-identity bootstrap payload and read it on activation
   failure to rebuild the session offline from local PowerSync data.

## Source

- Migration discussion Fast-Follow list (Decisions 7/8): items 1–4.
- PR #134 (PR-C2 v2) review: items 5–6 — discussions r3496682829 (leave-drain),
  r3496488837 (offline cold-start); related r3496594954 (PowerSync-URL validation,
  tracked in `plans/025`/PR-E).

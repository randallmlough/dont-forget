# Preserve local data across auth transitions

## Decision

The local PowerSync database belongs to one durable internal User at a time. A
validated AsyncStorage owner marker stores that internal `users.id`; Clerk
subjects, emails, Households, and Members are not database ownership keys.

Every Authenticated App Session activation prepares ownership before PowerSync
can connect. A matching User may connect. A different User fails closed on Home
without mounting product queries or exposing retained content. The incoming
User can either sign out and return to sign-in as the previous User, or
explicitly confirm permanent removal of the previous User's local data.

Normal Sign Out, Clerk expiry, auth loss, stale activation cleanup, and direct
User changes call `disconnect()` and retain product rows, queued CRUD, and the
owner marker. Only confirmed different-User recovery calls
`disconnectAndClear()`. After that clear succeeds, ownership is assigned to the
incoming internal User before activation retries.

The owner marker is the ongoing source of truth. For databases created before
the marker existed, one rollout inference may claim ownership from exactly one
local `users.id`, or from the validated persisted Authenticated App Session when
the local Users table is empty. Contradictory or ambiguous evidence fails
closed and never clears data.

Queue count is deliberately irrelevant. PowerSync retains failed CRUD entries
for retry; sampling the queue would not prove that later writes cannot arrive.
The destructive boundary is explicit User confirmation, not a queue-zero
observation.

## Context

PowerSync `disconnect()` stops synchronization while keeping the local
database. `disconnectAndClear()` also removes local synced rows and queued
writes. The former Sign Out and replacement paths used the destructive method,
so offline changes could be lost after a normal auth transition even though
PowerSync would otherwise retry their upload.

The persisted Authenticated App Session binds a Clerk subject to an internal
User and remains useful restore evidence, but it is not durable database
ownership. Clerk's real signed-out shape has no User subject, so destructive
recovery is available only while an authenticated incoming Clerk User exactly
matches the blocked activation.

## Consequences

- Same-User reauthentication reconnects to the retained local database and can
  resume queued uploads.
- A different User cannot connect or replace the persisted session envelope
  until confirmed removal and owner assignment both succeed.
- Normal Sign Out critically clears the persisted session, critically signs
  out Clerk, then best-effort disconnects PowerSync and clears the outgoing
  User's Current List selection. Successful sign-out analytics run last.
- Failed clear or owner assignment remains blocked and can be retried.
- Signed-out restore selection policy is unchanged. Paths already allowed to
  restore are ownership-gated; a signed-out mismatch uses the existing
  restore-failure/sign-in path and never offers removal.

## Considered alternatives

- **Clear on every auth transition.** Rejected because it destroys valid local
  rows and queued offline writes.
- **Use the persisted session or Clerk subject as the owner.** Rejected because
  the session can be cleared and Clerk has no signed-out subject; neither is the
  durable internal User identity that owns product data.
- **Clear automatically when the upload queue appears empty.** Rejected because
  queue count is a transient sample and does not authorize deletion.
- **Add a product-write gate or stale-writer epoch.** Rejected as unnecessary.
  Existing activation attempts and the serialized database-operation chain
  prevent stale connection publication; explicit confirmation owns the clear.

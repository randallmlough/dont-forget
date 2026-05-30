# Invitation Flow

Source: `full-discussion.md`

## Definition

An **Invitation** is token-based, single-use, 7-day expiring, and revocable. It is delivered by email and/or copyable accept link. Manual short code entry belongs to reusable **Household Join Codes**, not Invitations.

Invitation email is delivery and pending-management metadata only. It is not an authorization check.

## Member Viewing

Household settings fetches Members with:

```http
GET /api/households/:householdId/members
```

The route validates that the signed-in User is an active Member of the target Household.

First-slice Member response shape should stay minimal:

- `membershipId`
- `userId`
- `displayName`
- `role`

Member UI should show display name or a non-email fallback plus role. No email is needed for first-slice Member viewing.

## Creating Invitations

Any active Member can create Invitations.

Route:

```http
POST /api/invitations
```

Body:

```json
{ "householdId": "...", "email": "optional@example.com" }
```

The route validates that the signed-in User is an active Member of the target Household. The client passes `householdId` explicitly instead of relying on hidden server-side active selection.

First UI is email-first: a Member enters an email and creates/sends an Invitation. After creation, show the copyable accept link as a fallback/share option.

Service/API also allows link-only creation with no email.

## Email Delivery

If email delivery fails after the Invitation is created, do not fail, revoke, or delete the Invitation. Return the created Invitation/link with an `emailDelivery` failure status so the Member can still copy and share the link.

Response-level `emailDelivery` statuses:

```ts
{ status: "not_requested" }
{ status: "sent" }
{ status: "skipped"; reason: "environment" }
{ status: "failed"; message: string }
```

Persisted delivery-attempt state is deferred.

Production is the only environment that sends real Invitation email by default. Tests fake email. Local logs or returns links unless explicitly configured. Staging real delivery requires a staging sender and recipient allowlisting.

## Duplicate Pending Invitations

When creating an emailed Invitation, if a pending, unexpired, unrevoked Invitation already exists for the same normalized email and Household, return the existing Invitation/link instead of creating a duplicate.

Do not add a database unique constraint for this rule in the first slice. Enforce it in the Invitation service because accepted/revoked/expired state makes the rule conditional.

Link-only single-use Invitation creation always creates a new Invitation because there is no stable recipient key to deduplicate against.

Email normalization is trim and lowercase only. Do not apply provider-specific rules such as Gmail dot or plus-address normalization.

## Pending Invitation List

Household settings lists pending Invitations with:

```http
GET /api/households/:householdId/invitations
```

Pending emailed Invitations may show invitee email only inside authenticated Household settings to current Members of that Household.

Pending Invitation rows should expose enough management context for first-slice UI:

- Invitation ID;
- optional invitee email;
- created time;
- expiration time;
- creator display name when available;
- copyable accept link;
- revoke availability.

Public preview/accept screens must not show invitee email addresses.

## Revoking Invitations

Route:

```http
PATCH /api/invitations/:invitationId
```

Body:

```json
{ "revoked": true }
```

The first slice does not support resending or mutating an existing Invitation. To resend, a Member revokes the old pending Invitation and creates a new one.

## Accepting Invitations

Public route:

```txt
/invitations/accept?token=...
```

Mutation:

```http
POST /api/invitations/accept
```

Body:

```json
{ "token": "..." }
```

Acceptance behavior:

- token is a long opaque URL-safe random value, such as 32 secure random bytes encoded as base64url;
- token does not include Invitation ID, email, Household ID, or any decodable payload;
- signed-in User may accept a valid token even when their email differs from the Invitation email;
- create or reuse the Membership;
- new joiners are plain `Member`, not `Owner`;
- if the Invitation is still pending, mark it accepted by the accepting User;
- set the joined Household active;
- call `reloadSession`;
- load the joined Household.

Acceptance is idempotent for an existing active Member of the invited Household: return success, set active Household, and do not create a duplicate Membership.

## Public Preview

Invitation preview can reveal only minimal context to token holders:

```ts
{ available: true, householdName: string, inviterDisplayName: string }
| { available: false }
```

Do not return inviter email, invitee email, Member list, or Household metadata beyond name.

Accept UI copy should use the domain term Household. Main copy should use inviter display name when available, with a non-email fallback such as "A Member". Do not show inviter email.

## Errors

Public unavailable copy:

```txt
This Invitation is no longer available.
```

Public UI and authenticated mutation errors should not distinguish whether a token never existed, expired, was revoked, or was already accepted.

# Household Join Code Flow

Source: `full-discussion.md`

## Definition

A **Household Join Code** is a reusable Household-scoped code/link that lets an authenticated User become a Member of the Household. It is separate from a single-use **Invitation**.

Each Household has at most one active enabled reusable code. Codes do not expire automatically; they remain valid until regenerated or disabled.

## Code Format

- Length: 8 characters.
- Alphabet: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.
- Store uppercase without separators.
- Display grouped for readability, such as `ABCD EFGH`.
- Links use canonical ungrouped form, such as `ABCDEFGH`.
- Normalize input by uppercasing and stripping spaces/dashes.
- Enforce uniqueness on the visible code value.

## Creation

When the server creates an initial Household, it also creates that Household's reusable Join Code.

## Management UI

Household settings is the place to view and manage the active Household's Join Code.

Any active Member can view, regenerate, disable, or enable the code in the first slice.

Enabled state should show:

- grouped visible code;
- copyable Household join link;
- regenerate action;
- disable action.

Disabled state should not show an old visible code as reusable. Enabling after disable creates a new code row instead of resurrecting the old visible code.

## Lifecycle Model

`household_join_codes` should use explicit lifecycle columns:

- `id`
- `household_id`
- `code`
- `created_by_user_id`
- `created_at`
- `disabled_at`
- `disabled_by_user_id`
- `replaced_at`
- `replaced_by_user_id`

The active code is the newest row where `disabled_at` and `replaced_at` are null.

Regeneration creates a new code row and marks the old row inactive/replaced. Old links/codes become unavailable.

## Joining By Code

Manual code entry is available from the Household switch page for signed-in Users.

Reusable join links use:

```txt
/households/join?code=ABCDEFGH
```

Signed-out Users opening a join link are sent through sign-in/sign-up while preserving the code.

Successful join behavior:

- create or reuse the Membership;
- always create the joined User as a plain `Member`, not `Owner`;
- write a join-code use audit row;
- set the joined Household as active;
- call `reloadSession`;
- navigate to Home for the newly active Household.

Joining is idempotent for a User who is already an active Member of that Household: return success, set the Household active, and do not create a duplicate Membership.

## Use Audit

`household_join_code_uses` should store:

- `id`
- `household_join_code_id`
- `household_id`
- `user_id`
- `membership_id`
- `used_at`

Do not store the visible code string on the use audit row.

## Attempt Guard

Manual code entry records failed attempts in `household_join_code_attempts`, keyed by `user_id`.

Fields:

- `user_id`
- `failed_count`
- `window_started_at`
- `last_failed_at`

Do not store attempted code values.

Initial guard: 5 failed attempts per 15 minutes. A successful join clears the User's failed-attempt window.

## Errors

Use generic user-facing copy for invalid, disabled, replaced, or unavailable codes:

```txt
This Household code is not available.
```

Use a retry-oriented throttling message:

```txt
Too many attempts. Try again later.
```

Do not reveal whether a submitted code ever existed.

## API Routes

Management:

```http
GET /api/households/:householdId/join-code
POST /api/households/:householdId/join-code/regenerate
PATCH /api/households/:householdId/join-code
```

Enable/disable body:

```json
{ "enabled": true }
```

Join:

```http
POST /api/households/join-code/join
```

Body:

```json
{ "code": "ABCDEFGH" }
```

Preview route path is implementation-level, but should be a public `GET` route returning a boolean-style availability shape:

```ts
{ available: true, householdName: string } | { available: false }
```

# Household Switching

Source: `full-discussion.md`

## Decision

Household switching is User-scoped, directory-owned state. The active Household is stored on `users.active_household_id`, and the Authenticated App Session bootstrap prefers that value when it still points to an active Membership for the signed-in User.

If the stored active Household is null, deleted, or no longer an active Membership, bootstrap chooses a valid Membership using the deterministic oldest-active-Membership fallback and repairs `users.active_household_id`.

## Viewing Associated Households

Bootstrap returns all active Households for the User:

```ts
households: Array<{
  id: string;
  name: string;
  role: "owner" | "member";
  isActive: boolean;
}>
```

Do not include `memberCount` in this bootstrap array for the first slice. Fetch detailed Household settings data separately.

## UI Flow

- Household settings has a button labeled "Switch Household".
- Tapping it navigates to a separate Household switch page, likely `/household/switch`.
- The switch page lists all available Households from the Authenticated App Session `households` array.
- The current active Household shows a badge.
- The switch page also includes "Join Household with Code" for signed-in Users.
- Selecting another Household is online-only in the first slice.

## Switch Mutation

Switching uses:

```http
PATCH /api/users/me/active-household
```

Body:

```json
{ "householdId": "..." }
```

The server validates that the signed-in User has an active Membership in the target Household before updating `users.active_household_id`.

## Sync Before Switch

Before switching, the client should request sync for the currently active Household and proceed only if that sync succeeds.

If current-Household sync fails because the device is offline or the remote request fails:

- keep the current Household active;
- do not call the active-Household update endpoint;
- show a retryable switching error.

Rationale: switching is online-only, and syncing first avoids leaving recent local changes stranded on the device while the User moves to another Household.

## Previous Household Behavior

Switching does not remove the User from the previous Household, delete the previous Household, or mutate the previous Household's Lists/Items.

After a successful switch:

- `users.active_household_id` points to the selected Household;
- the client calls provider-level `reloadSession`;
- the Authenticated App Session controller opens the newly active Household resource set;
- the previous Household resource set is retired using existing replacement policy;
- the previous Household remains in the `households` array and can be switched back to later.

## Invitation And Code Joins

Accepting an Invitation or joining with a reusable Household Join Code also switches active Household immediately. Those flows create or reuse the Membership, set `users.active_household_id`, call `reloadSession`, and load the joined Household.

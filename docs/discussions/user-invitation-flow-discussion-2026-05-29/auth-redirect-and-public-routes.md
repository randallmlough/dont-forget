# Auth Redirect And Public Routes

Source: `full-discussion.md`

## Decision

Invitation accept and reusable Household join links are public entrypoints that may need authentication before completing the mutation.

The routes must preserve intent through sign-in/sign-up and then run the accept/join endpoint before normal first-run bootstrap creates a default Household.

## Public Routes

Single-use Invitation:

```txt
/invitations/accept?token=...
```

Reusable Household Join Code link:

```txt
/households/join?code=ABCDEFGH
```

Both routes live outside `(app)` and `(auth)` route groups. They should be reachable while signed out and while signed in.

## Signed-Out Preservation

Signed-out Users opening either public route should be sent through Clerk while preserving the target route and token/code.

Canonical auth route param:

```txt
next
```

Examples:

```txt
/sign-in?next=/invitations/accept&token=...
/sign-up?next=/households/join&code=ABCDEFGH
```

Keep token/code params separate from `next`; do not nest encoded query strings inside `next` for this slice.

After Clerk auth succeeds, redirect policy sends the User back to the public accept/join route. That route runs the accept/join endpoint, which upserts the User, creates or reuses Membership, sets `users.active_household_id`, and then allows the authenticated app to load the joined Household.

## Redirect Policy Module

Add a central pure redirect policy module near `AuthGate`, such as:

```txt
components/auth/redirect-policy.ts
```

The policy decides navigation targets. It should not own Authenticated App Session resources, call bootstrap directly, or live under `lib/services/session`.

The policy should handle:

- public auth-preserving routes such as `/invitations/accept` and `/households/join`;
- ordinary signed-out auth routes;
- authenticated app routes;
- future pathways such as onboarding.

## General `next` Behavior

`next` should work across internal app routes, not only Invitation and Household Join Code routes. For example, if a User is on settings or a subpage and must re-authenticate, the same `next` behavior can return them to that internal route.

Examples:

```txt
/sign-in?next=/invitations/accept&token=...
/sign-in?next=/household/settings
```

`next` must be internal-only. External URLs or malformed paths should be rejected or ignored and fall back to `/`.

The first slice handles signed-out or auth-lost redirects only. Do not build a separate explicit reauthentication flow yet, but keep the policy compatible with that future path.

## Preview Privacy

Invitation preview may show:

- Household name;
- inviter display name, or a non-email fallback.

Invitation preview must not show:

- inviter email;
- invitee email;
- Member list;
- Household metadata beyond name.

Reusable Household Join Code preview may show only minimal Household context, such as:

```txt
Join the Smith Household.
```

Join-code preview must not show inviter identity, Member list, or other Household metadata.

## Unavailable Copy

Invitation:

```txt
This Invitation is no longer available.
```

Household code:

```txt
This Household code is not available.
```

Throttling:

```txt
Too many attempts. Try again later.
```

Do not reveal whether a token/code never existed, expired, was revoked, accepted, disabled, or replaced.

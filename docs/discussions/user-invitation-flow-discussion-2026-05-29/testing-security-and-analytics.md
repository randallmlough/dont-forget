# Testing, Security, And Analytics

Source: `full-discussion.md`

## Testing Direction

Database integration testing is required for the new service and `lib/api` behavior.

Existing useful test support:

- migrated temp directory DB helpers in `db/test.ts`;
- persisted row builders and scenarios in `db/fixtures/`;
- React, Clerk, and native mocks under `lib/test/`;
- server service integration tests using real directory DB behavior.

Existing API route coverage is limited. `lib/services/session/server/bootstrap-api-route.test.ts` verifies `app/api/bootstrap+api.ts` does not load server-only dependencies during route registration, but there is not yet a reusable authenticated API handler integration harness.

## Test Helpers To Add

Add only the smallest helper needed by the first handler tests. Promote shared pieces as duplication appears.

Shared API test helpers should live under:

```txt
lib/test/api/
```

Likely missing helpers:

- construct authenticated server requests or injected server user profiles;
- common handler dependency-injection pattern;
- response assertion helper if useful;
- fake email sender injection/mocking.

## Fixtures To Add

After schema changes, add builders/scenarios for:

- active Household selection;
- multi-Household User membership;
- Household Join Codes;
- Household Join Code uses;
- Household Join Code attempts;
- Invitation variants needed by the new behavior.

## Service Tests

Use real directory DB behavior for:

- active Household preference, fallback, and repair;
- Invitation create, duplicate pending reuse, preview, accept, list, and revoke;
- Household Join Code creation, preview, join, regenerate, disable, and enable;
- join-code attempt window behavior;
- idempotent accept/join for existing Members;
- concurrent reusable code use by two different Users.

External services such as email delivery should be injected or mocked.

## API Handler Tests

Test `lib/api` handlers directly where practical, with real directory DB behavior and injected dependencies.

Cover:

- auth required on mutations;
- active-Member authorization for Household-scoped management;
- generic unavailable errors;
- status-code policy;
- response shapes;
- `emailDelivery` status behavior;
- no server-only imports during route registration for Expo API route wrappers.

## Security And Privacy Rules

Do not show inviter email in public Invitation accept UI.

Do not show invitee email in public preview/accept UI.

Pending emailed Invitation rows may show invitee email only inside authenticated Household settings to current Members of that Household.

Public Invitation preview may reveal only:

- Household name;
- inviter display name or non-email fallback.

Public Household Join Code preview may reveal only:

- Household name.

Do not reveal whether unavailable tokens/codes never existed, expired, were revoked, accepted, disabled, or replaced.

Do not store attempted join-code values in failed-attempt rows.

Do not store visible code strings on join-code use audit rows.

Invitation tokens must be long opaque bearer secrets. They should not include Invitation ID, email, Household ID, or any decodable payload.

## Generic Errors

Invitation unavailable:

```txt
This Invitation is no longer available.
```

Household code unavailable:

```txt
This Household code is not available.
```

Join-code throttling:

```txt
Too many attempts. Try again later.
```

## Analytics Events

Track separate events so product usage can compare Invitation, reusable Household Join Code, and switching paths.

Success events:

- `invitation_accepted`
- `household_join_code_used`
- `household_switched`

Control events:

- `invitation_created`
- `invitation_revoked`
- `household_join_code_regenerated`
- `household_join_code_disabled`
- `household_join_code_enabled`

Keep properties safe and minimal:

- Household/Member role context where useful;
- source fields such as `email`, `link`, `manual_code`, or `join_link`.

Never include email addresses, visible join codes, Invitation tokens, or other secrets in analytics properties.

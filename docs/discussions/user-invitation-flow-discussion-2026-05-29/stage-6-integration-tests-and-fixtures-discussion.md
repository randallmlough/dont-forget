# Stage 6 Discussion: Integration Tests And Fixtures

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/testing-security-and-analytics.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/implementation-handoff.md`
- `docs/how-things-work/testing.md`
- `docs/code-standards/testing.md`
- `db/test.ts`
- `db/fixtures/builders.ts`
- `db/fixtures/scenarios.ts`
- `lib/test/setup.ts`
- `lib/test/mocks/analytics.ts`
- `lib/test/mocks/clerk.ts`
- `lib/services/session/server/bootstrap-api-route.test.ts`

## Stage Scope

This stage adds the integration-test support and behavior coverage needed before UI work: fixtures, API test helpers, service tests, API handler tests, and route-registration safety tests.

## Current State

- Tests are integration-first for product behavior.
- Directory and Household DB tests use migrated temp libSQL databases.
- Shared persistence builders/scenarios exist for current User, Household, Membership, Invitation, List, Item, and `item_checks` rows.
- There is no reusable API handler integration harness.
- Existing API route coverage is limited to bootstrap lazy-registration behavior.

## Stage Decisions

- Add only the smallest shared API helper needed by first handler tests.
- Place shared API helpers under `lib/test/api`.
- Use real directory DB behavior for service and API handler tests.
- Mock/inject external email delivery.
- Add fixtures for new schema facts.
- Test security/privacy constraints as observable behavior.
- Test analytics where events represent product funnel outcomes.

## Module Plan

- Fixture builders and scenarios.
- API test helper.
- Service integration tests.
- API handler integration tests.
- Route wrapper lazy-import tests.
- Analytics test doubles.

## Testing And Verification

- Test active Household selection and repair.
- Test Invitation create/list/revoke/preview/accept.
- Test Household Join Code lifecycle and join.
- Test manual failed attempt throttling.
- Test concurrent reusable-code use by different Users.
- Test status code policy.
- Test analytics events avoid secrets.

## Out Of Scope

- UI tests for visual layout.
- Maestro native offline flows unless Jest cannot prove a behavior.
- QR code tests.

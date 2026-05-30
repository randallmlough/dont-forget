# PRD: User Invitation Flow Stage 6 - Integration Tests And Fixtures

## Problem Statement

The Invitation, Household Join Code, Household switching, and API layers carry important authorization, privacy, and concurrency behavior. Without integration-first tests and shared fixtures, later UI work could pass shallow tests while core Household access rules are wrong.

## Solution

Add the fixture and test harness support needed to prove the new backend and API behavior with real directory DB state. Cover service behavior, API handlers, route-registration safety, status codes, privacy constraints, and analytics contracts before building UI.

## User Stories

1. As a maintainer, I want active Household selection tested with real directory DB rows, so that switching state is trustworthy.
2. As a maintainer, I want Invitation lifecycle tested end to end at the service/API boundary, so that create, list, revoke, preview, and accept behavior is proven.
3. As a maintainer, I want Household Join Code lifecycle tested, so that view, regenerate, disable, enable, and join behavior is proven.
4. As a maintainer, I want failed code attempts tested, so that throttling works without storing attempted codes.
5. As a maintainer, I want two Users using the same reusable code tested, so that multi-use behavior is safe.
6. As a developer, I want shared fixtures for multi-Household Users, so that switching tests do not hand-roll setup.
7. As a developer, I want shared fixtures for Join Codes, uses, and attempts, so that service and API tests stay readable.
8. As a developer, I want API handler helpers, so that authenticated requests can be tested consistently.
9. As a developer, I want route-registration tests, so that server-only modules are not loaded during Expo route registration.
10. As a maintainer, I want analytics assertions for product outcomes, so that events are emitted without secrets.
11. As a maintainer, I want privacy behavior tested, so that public previews never expose emails or extra Household data.

## Implementation Decisions

- Keep integration-first testing as the default for product behavior.
- Use migrated temp directory DBs and real services wherever practical.
- Add shared API test helpers only when duplication appears in handler tests.
- Put shared API helpers under the existing test support area.
- Mock or inject external email delivery rather than performing network sends.
- Add fixtures for active Household selection, multi-Household Membership, Household Join Codes, Join Code uses, Join Code attempts, and Invitation variants.
- Cover route wrappers separately from handler behavior to preserve native bundle safety.
- Treat generic user-facing errors and status codes as testable contracts.
- Treat analytics event names and safe property shapes as testable contracts.

## Testing Decisions

- Service tests use real directory DB behavior.
- API handler tests use real directory DB behavior plus injected dependencies.
- Route wrapper tests verify lazy import behavior.
- Fixture tests verify new scenarios produce valid rows.
- Security/privacy tests assert omitted fields and generic errors rather than implementation details.
- Analytics tests assert event names and safe properties, and assert that emails, visible codes, and tokens are not emitted.
- Race-sensitive reusable-code tests may use controlled collaborators only for the timing edge being asserted.

## Out of Scope

- UI route rendering.
- Native end-to-end offline switching flows.
- QR scanning or rendering.
- Testing external provider behavior.

## Further Notes

This stage can overlap with service/API implementation, but UI should wait until these contracts are proved.

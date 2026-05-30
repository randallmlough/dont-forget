# PRD: User Invitation Flow Stage 5 - API Layer

## Problem Statement

The new services need HTTP endpoints, but placing request parsing and response shaping directly in Expo route files would make routes hard to test and could violate native bundle safety. The app needs a clear API boundary that remains thin at the route layer and testable below it.

## Solution

Add a `lib/api` layer for server-only API handlers and keep Expo route files as lazy-loading wrappers. Implement the agreed route contracts for active Household switching, Invitation creation/list/revoke/accept/preview, Household Join Code management/join/preview, and Member listing.

## User Stories

1. As a User, I want the app to update my active Household through an authenticated API, so that switching is durable.
2. As a signed-out User, I want public Invitation preview to show safe context, so that I know what I am accepting.
3. As a signed-out User, I want public Household Join Code preview to show safe context, so that I know what Household I am joining.
4. As a signed-in User, I want to accept an Invitation through an API, so that I can become a Member and load the joined Household.
5. As a signed-in User, I want to join with a Household code through an API, so that I can become a Member and load the joined Household.
6. As a Member, I want to create an Invitation through an API, so that I can invite another User.
7. As a Member, I want to list pending Invitations, so that I can manage outstanding access.
8. As a Member, I want to revoke an Invitation, so that it can no longer be accepted.
9. As a Member, I want to list Members, so that Household settings can show who belongs to the Household.
10. As a Member, I want to view and manage the Household Join Code, so that reusable access can be controlled.
11. As a developer, I want API handlers to be directly testable, so that HTTP behavior can be verified without route-registration side effects.
12. As a maintainer, I want route files to lazy-load server-only modules, so that native route registration stays safe.

## Implementation Decisions

- Add API handler modules as the HTTP boundary for parsing, auth verification, response shaping, and service orchestration.
- Keep domain behavior and database access in services.
- Keep Expo API route files thin and lazy-loaded.
- Add import guardrails so app/client code cannot import API handler modules.
- Use public preview routes for Invitation and Household Join Code availability.
- Use resource-oriented routes where practical, with an explicit join action route for reusable Household Join Code use.
- Return generic unavailable responses for invalid, expired, revoked, accepted, disabled, replaced, or nonexistent tokens/codes.
- Apply documented status codes for auth, authorization, unavailable resources, throttling, and conflicts.
- Include `emailDelivery` status in Invitation creation responses.

## Testing Decisions

- Test API handlers directly with real directory DB behavior and injected service dependencies where needed.
- Test route wrappers for lazy server import behavior.
- Test missing/invalid auth returns unauthorized status on mutation routes.
- Test active-Member authorization failures for Household management routes.
- Test generic unavailable responses for tokens/codes.
- Test throttling response for manual Join Code attempts.
- Test response shapes for creation, accept, join, switch, preview, list, revoke, and Join Code management.
- Test the import boundary rule for API handler modules.

## Out of Scope

- UI screens consuming the APIs.
- Service implementation details already covered by the services stage.
- QR code.
- Persisted email delivery-attempt history.

## Further Notes

The API layer should be boring orchestration. If business logic starts accumulating in handlers, move it back into services before continuing.

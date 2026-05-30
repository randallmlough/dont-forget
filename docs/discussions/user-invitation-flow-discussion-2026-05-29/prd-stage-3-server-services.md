# PRD: User Invitation Flow Stage 3 - Server Services

## Problem Statement

The app needs durable server-side behavior for Household switching, Invitations, and reusable Household Join Codes. Without domain services, API handlers would either duplicate business rules or place database behavior directly in HTTP route code.

## Solution

Add server services that own active Household selection, Invitation lifecycle, Household Join Code lifecycle, link generation, and email delivery orchestration. Keep services domain-shaped, dependency-injectable, and integration-tested against the directory DB.

## User Stories

1. As a User, I want switching Household to validate my Membership, so that I cannot activate a Household I do not belong to.
2. As a User, I want accepting an Invitation to create or reuse my Membership, so that I can join the intended Household.
3. As a User, I want accepting an Invitation to switch active Household, so that I immediately see the joined Household.
4. As a User, I want joining by Household code to create or reuse my Membership, so that reusable codes work for multiple Users.
5. As an existing Member, I want accepting a still-valid Invitation or code for my Household to succeed, so that valid links do not feel broken.
6. As a Member, I want to create an emailed Invitation, so that another User can join my Household.
7. As a Member, I want to create a link-only Invitation, so that I can share through another channel.
8. As a Member, I want a failed email delivery not to delete the Invitation, so that I can copy and send the link myself.
9. As a Member, I want to list pending Invitations, so that I can manage outstanding access.
10. As a Member, I want to revoke a pending Invitation, so that it can no longer be accepted.
11. As a Member, I want to view my Household Join Code, so that I can share it manually.
12. As a Member, I want to regenerate a Household Join Code, so that an exposed code stops working.
13. As a Member, I want to disable and enable the Household Join Code, so that reusable access can be paused and resumed with a new code.
14. As a maintainer, I want successful code joins audited, so that reusable-code usage can be inspected.
15. As a maintainer, I want failed code attempts tracked compactly, so that brute-force attempts are throttled without storing attempted codes.

## Implementation Decisions

- Use server domain services for active Household selection, Invitation behavior, and Household Join Code behavior.
- Services own database access and return domain-shaped records, not HTTP payloads.
- Active Household selection validates active Membership before updating User-scoped active Household state.
- Invitation creation validates that the creator is an active Member of the target Household.
- Emailed Invitation creation reuses an existing pending, unexpired, unrevoked Invitation for the same normalized email and Household.
- Link-only Invitation creation always creates a new Invitation.
- Invitation email is delivery metadata only, not authorization.
- Invitation acceptance is token-based and may be performed by any signed-in User with the valid token.
- Household Join Code join is reusable and multi-use.
- Join Code regeneration creates a new row and marks the old row replaced.
- Enabling after disable creates a new code row instead of resurrecting an old visible code.
- Services inject link generation, token/code generation, and email sending to keep production secure and tests deterministic.
- Services emit analytics only for successful domain outcomes.

## Testing Decisions

- Test services through real directory DB integration tests.
- Mock or inject external email delivery.
- Test active Household validation and update behavior.
- Test Invitation create, duplicate pending reuse, preview, accept, list, and revoke.
- Test Join Code current-code lookup, preview, join, regenerate, disable, and enable.
- Test failed attempt windows and success clearing behavior.
- Test idempotent accept/join for existing Members.
- Test two different Users using the same active reusable code concurrently.
- Test collision retry behavior with injected generators.

## Out of Scope

- HTTP route files and API handlers.
- Client session reload.
- Auth redirect routing.
- UI screens.
- QR rendering.

## Further Notes

This stage creates the domain backbone used by API and UI stages. It should avoid HTTP concepts in service return shapes unless a value is truly domain-level.

# PRD: User Invitation Flow Stage 7 - UI Routes And Screens

## Problem Statement

The backend and API contracts will support Invitations, reusable Household Join Codes, and Household switching, but Users need screens to manage and use those flows. The UI must expose Household settings, switching, manual code join, and public accept/join routes without violating session ownership or privacy decisions.

## Solution

Build the UI on top of the completed backend/session/API contracts. Add Household settings, Household switch, public Invitation accept, and public Household join routes. Update AuthGate with a pure redirect policy so public routes can preserve intent through sign-in/sign-up.

## User Stories

1. As a Member, I want a Household settings page, so that I can manage Household-level access outside the List UI.
2. As a Member, I want to see current Members of my Household, so that I know who has access.
3. As a Member, I want to create an Invitation by email, so that another User can join my Household.
4. As a Member, I want to copy an Invitation link after creation, so that I can share it if email delivery fails or I use another channel.
5. As a Member, I want to see pending Invitations, so that I know who has been invited.
6. As a Member, I want to revoke a pending Invitation, so that it can no longer be accepted.
7. As a Member, I want to view my Household Join Code, so that I can share it with another User.
8. As a Member, I want to regenerate the Household Join Code, so that old shared codes stop working.
9. As a Member, I want to disable and enable the Household Join Code, so that reusable access can be controlled.
10. As a User with multiple Households, I want a switch page, so that I can choose the active Household.
11. As a User with multiple Households, I want the current Household badged, so that I know which Household is active.
12. As a User, I want switching to sync the current Household first, so that my recent local changes are not stranded.
13. As a User, I want failed switching sync to keep me on the current Household, so that I can retry safely.
14. As a signed-in User, I want to join a Household by entering a code, so that I can use a code another Member shared.
15. As a signed-out User, I want an Invitation link to preserve through sign-in/sign-up, so that I can accept it without reopening the link.
16. As a signed-out User, I want a Household Join Code link to preserve through sign-in/sign-up, so that I can join without reopening the link.
17. As a token holder, I want minimal preview context, so that I know which Household I am joining without exposing private details.
18. As a User, I want successful accept, join, and switch flows to reload the session, so that I land in the correct Household.

## Implementation Decisions

- Add Household settings as a dedicated authenticated page.
- Add Household switch as a separate authenticated page reached from settings.
- Add Home entry point to Household settings from the signed-in top bar/header.
- Add public Invitation accept and Household join routes outside authenticated and auth-only route groups.
- Add a pure redirect policy module near AuthGate.
- Preserve post-auth intent in route params with `next` plus separate token/code params.
- Reject external or malformed `next` targets and fall back safely.
- Public previews show only agreed minimal context.
- Settings may show invitee email only for pending emailed Invitations to authenticated current Members.
- Switch flow requests current Household sync before calling the switch API.
- Successful accept, join, and switch flows call `reloadSession`.
- Screens consume provider state/actions and API clients; they do not open, close, or replace Household resources.

## Testing Decisions

- Test redirect policy as pure logic.
- Test AuthGate route decisions with signed-in, signed-out, cached session, public route, auth route, and internal `next` scenarios.
- Test Household settings with mocked API responses and provider state.
- Test Invitation creation success, email-delivery failure, duplicate existing response display, and revoke behavior.
- Test Join Code enabled, disabled, regenerated, copied, and unavailable states.
- Test switch screen Household list, active badge, sync-before-switch success, and sync failure.
- Test public Invitation and Household join screens for preview, signed-out preservation, mutation success, generic unavailable errors, and `reloadSession`.
- Test privacy: no inviter email, no invitee email on public screens, no Member list in public previews.

## Out of Scope

- QR code rendering.
- Owner-only access controls.
- Member removal, role changes, or Household deletion.
- Offline Household switching.
- Native end-to-end deep-link validation unless added as a later QA slice.

## Further Notes

This stage should not invent temporary client state for Household switching. It should rely on the server and Authenticated App Session contracts built in earlier stages.

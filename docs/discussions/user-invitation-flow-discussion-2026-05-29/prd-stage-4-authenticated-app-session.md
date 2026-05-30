# PRD: User Invitation Flow Stage 4 - Authenticated App Session

## Problem Statement

The current Authenticated App Session only exposes one active Household and chooses the oldest active Membership until explicit switching exists. The app needs session support for active Household persistence, associated Household listing, and controlled reload after Household-changing mutations.

## Solution

Extend bootstrap and the Authenticated App Session provider so the active Household is selected from directory state, all associated Households are returned, and screens can request a provider-owned session reload after accept, join, or switch operations.

## User Stories

1. As a User, I want the app to remember my active Household, so that I return to the Household I last selected.
2. As a User, I want to see all Households I belong to, so that I can choose another Household.
3. As a User, I want accepting an Invitation to reload the app into the joined Household, so that I immediately see the result.
4. As a User, I want joining by Household code to reload the app into the joined Household, so that I can start using it immediately.
5. As a User, I want switching Household to reload the app into the selected Household, so that Lists and Members come from the right Household.
6. As a User, I want the app to recover if my stored active Household is no longer valid, so that I am not stuck on a broken session.
7. As a first-run User, I want the app to create a Household only when I have no Memberships, so that opening a join link does not create an unwanted Household first.
8. As a developer, I want screens to call one reload action, so that they do not manage bootstrap or Household resources directly.
9. As a maintainer, I want resource replacement to remain controller-owned, so that previous Household resources are retired consistently.

## Implementation Decisions

- Add associated Households to the bootstrap contract with id, name, role, and active marker.
- Server bootstrap prefers User-scoped active Household selection when it points to an active Membership.
- Server bootstrap repairs invalid or missing active selection with the deterministic fallback.
- First-run Household creation only happens when the User has no active Memberships.
- The provider exposes `reloadSession` as the public action for accept, join, and switch screens.
- `reloadSession` reuses controller activation/replacement behavior instead of adding a separate resource path.
- Screens remain consumers of session state/actions and must not open, close, or replace Household resources.
- Existing cached-to-fresh replacement and stale-resource behavior remain the model for reload.

## Testing Decisions

- Use server bootstrap integration tests with real directory DB state.
- Test valid active Household preference.
- Test invalid active Household repair.
- Test multi-Household bootstrap response and active marker.
- Test first-run behavior remains unchanged for Users with no Memberships.
- Test provider exposes `reloadSession` and triggers controller activation.
- Test previous session remains available during reload according to existing replacement policy.
- Test client bootstrap schema parsing for the new `households` array.

## Out of Scope

- Active-Household update API handler.
- Invitation and Join Code mutation handlers.
- Household switch UI.
- Public accept/join route UI.
- Offline Household switching.

## Further Notes

This stage should land before UI so screens have a stable session contract to consume.

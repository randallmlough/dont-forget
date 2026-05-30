# Stage 4 Discussion: Authenticated App Session

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/implementation-handoff.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-switching.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/api-service-and-session-contracts.md`
- `docs/adr/0012-authenticated-app-session-controller.md`
- `docs/how-things-work/authenticated-app-session.md`
- `lib/bootstrap.ts`
- `lib/services/session/bootstrap.ts`
- `lib/services/session/controller.ts`
- `components/session/authenticated-app-session-provider.tsx`
- `lib/services/session/server/bootstrap.ts`

## Stage Scope

This stage updates Authenticated App Session bootstrap and provider/controller contracts so the app can represent multiple associated Households, switch active Household, and reload the session after accept/join/switch mutations.

## Current State

- Server bootstrap chooses the oldest active Membership until switching exists.
- Bootstrap creates a first-run Household only when no active Membership exists.
- Bootstrap response includes User, active Household, active Member, Members, and Household database credentials.
- The provider exposes `retry` and `signOut`, but not `reloadSession`.
- The controller already owns resource replacement and can keep previous session state while loading.

## Stage Decisions

- Bootstrap should prefer valid `users.active_household_id`.
- Bootstrap should repair null/invalid active Household selection using the deterministic Membership fallback.
- Bootstrap should return a `households` array with id, name, role, and isActive.
- Bootstrap should create first-run Household only when the User has no active Memberships.
- Provider should expose `reloadSession`.
- `reloadSession` should trigger fresh Authenticated App Session activation using existing controller resource replacement policy.
- Screens must call `reloadSession` after successful accept, join, or switch mutations.
- Screens must not manually call bootstrap or open Household resources.

## Module Plan

- Shared bootstrap schema/types.
- Client bootstrap fetch service.
- Server bootstrap orchestration.
- Authenticated App Session controller/provider public action.
- Session tests and provider tests.

## Testing And Verification

- Test bootstrap preference for valid active Household.
- Test fallback and repair for missing/invalid active Household.
- Test first-run creation still only occurs when the User has no active Memberships.
- Test `households` array shape and active marker.
- Test provider exposes and wires `reloadSession`.
- Test reload uses existing resource replacement behavior and keeps screens from managing resources.

## Out Of Scope

- API handlers for accept/join/switch.
- UI switch page.
- Public accept/join routes.

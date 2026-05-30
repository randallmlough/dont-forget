# Stage 7 Discussion: UI Routes And Screens

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-switching.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-join-code-flow.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/invitation-flow.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/auth-redirect-and-public-routes.md`
- `docs/code-standards/react-native.md`
- `docs/how-things-work/routing.md`
- `components/auth/auth-gate.tsx`
- `screens/home/home-screen.tsx`
- `components/session/authenticated-app-session-provider.tsx`

## Stage Scope

This stage adds the UI routes and screens for Household settings, Household switching, manual code join, public Invitation accept, public Household join, and Home entry points.

## Current State

- Current routes are Home, sign-in, and sign-up.
- AuthGate only knows signed-out auth routes.
- Home top bar shows signed-in Member context and sign-out.
- There is no Household settings page.
- There is no Household switch page.
- There are no public Invitation accept or Household join routes.

## Stage Decisions

- Add a dedicated Household settings route, likely `/household/settings`.
- Add a Home entry point to Household settings from the signed-in top bar/header.
- Add a separate Household switch route, likely `/household/switch`.
- Switch page lists associated Households, badges the current one, and supports switching.
- Switch page includes "Join Household with Code".
- Switching requests current Household sync first and blocks on sync failure.
- Public Invitation route is `/invitations/accept?token=...`.
- Public Household Join Code route is `/households/join?code=ABCDEFGH`.
- Public routes preserve intent through sign-in/sign-up with `next`.
- Successful accept/join/switch calls `reloadSession`.

## Module Plan

- Auth redirect policy module near AuthGate.
- Public accept/join screens.
- Household settings screen.
- Household switch screen.
- Screen-local hooks for API calls and loading/error states.
- Reusable UI components only where repeated by the new screens.

## Testing And Verification

- Test redirect policy as pure logic.
- Test AuthGate behavior for public routes, signed-out routes, auth routes, cached sessions, and internal `next`.
- Test Household settings renders Members, Invitations, and Join Code controls from API state.
- Test switch screen renders Households and current badge.
- Test switch flow sync-before-switch behavior.
- Test code join and Invitation accept call server mutation then `reloadSession`.
- Test public previews do not show emails.

## Out Of Scope

- QR rendering.
- Owner-only permissions.
- Member removal and role changes.
- Offline Household switching.

# Routing

Don't Forget uses Expo Router with route groups. Route groups organize files without changing URLs.

## File Tree

```text
src/app/
  _layout.tsx
  (app)/
    _layout.tsx
    index.tsx
    settings.tsx
    household/
      settings.tsx
      switch.tsx
  (auth)/
    _layout.tsx
    sign-in.tsx
    sign-up.tsx
  households/
    join.tsx
  invitations/
    accept.tsx
  api/
    bootstrap+api.ts
    data+api.ts
    households+api.ts
    households/
      [householdId]+api.ts
      [householdId]/
        invitations+api.ts
        join-code+api.ts
        join-code/
          regenerate+api.ts
        members+api.ts
        members/
          [membershipId]+api.ts
          me/
            leave+api.ts
      join-code/
        join+api.ts
        preview+api.ts
    invitations+api.ts
    invitations/
      [invitationId]+api.ts
      accept+api.ts
      preview+api.ts
    users/
      me+api.ts
      me/
        active-household+api.ts
```

Current screen routes:

| URL | Route File | Screen |
| --- | --- | --- |
| `/` | `src/app/(app)/index.tsx` | `src/client/features/list/home-screen.tsx` |
| `/settings` | `src/app/(app)/settings.tsx` | `src/client/features/settings/settings-screen.tsx` |
| `/household/settings` | `src/app/(app)/household/settings.tsx` | `src/client/features/household/household-settings-screen.tsx` |
| `/household/switch` | `src/app/(app)/household/switch.tsx` | `src/client/features/household/household-switch-screen.tsx` |
| `/sign-in` | `src/app/(auth)/sign-in.tsx` | `src/client/features/auth/sign-in-screen.tsx` |
| `/sign-up` | `src/app/(auth)/sign-up.tsx` | `src/client/features/auth/sign-up-screen.tsx` |
| `/households/join` | `src/app/households/join.tsx` | `HouseholdJoinScreen` from `src/client/features/household/public-household-entry-screen.tsx` |
| `/invitations/accept` | `src/app/invitations/accept.tsx` | `InvitationAcceptScreen` from `src/client/features/household/public-household-entry-screen.tsx` |

## Root Layout

`src/app/_layout.tsx` owns app-wide providers and routing side effects:

- PostHog provider
- Safe area provider
- Clerk provider
- navigation theme
- auth gating
- analytics identity sync
- screen tracking
- OAuth browser warmup while signed out

Do not add duplicate Clerk or PostHog providers inside route groups.

## Authenticated Layout

`src/app/(app)/_layout.tsx` owns signed-in product providers. It mounts the Authenticated App Session provider around signed-in routes, and that provider activates the app-owned Authenticated App Session and exposes session state/actions to screens.

Screens consume `useAuthenticatedAppSession()`. They should not manage the PowerSync connection or session resources directly, and they should not own sync lifecycle.

See [Authenticated App Session](./authenticated-app-session.md) for the provider boundary, state model, replacement policy, and sign-out cleanup contract.

## Auth Gate

`AuthGate` uses the current pathname to detect signed-out auth routes. Signed-out Users are redirected to `/sign-in`; signed-in Users are redirected away from auth routes to `/`.

The session-owned sign-out action runs in this order:

```ts
track("user_signed_out", {});
reset();
await db.disconnectAndClear();
await clearAuthenticatedAppSessionPresent();
await clearUserCurrentListSelections(userId);
await signOut();
```

PowerSync cleanup, session hint clearing, and signed-out User Current List selection clearing are best-effort; failures are logged and do not block Clerk sign-out. Clerk sign-out is the critical step. If it fails, the provider dispatches the failed sign-out event and restarts activation while auth still reports signed-in.

## Adding Routes

Add authenticated app routes under `src/app/(app)`. Add signed-out auth routes under `src/app/(auth)`. Create another route group only when that group needs shared navigation options, providers, or a clear route boundary.

Keep route files thin. Prefer this shape:

```tsx
export { default } from "@/client/features/example/example-screen";
```

Put screen-owned code in `src/client/features/<feature>/`. Put reusable UI primitives in `src/client/ui/`.

## Tests

Do not put tests in `src/app/`; Expo Router treats files there as route entries. Route and screen behavior tests live next to the relevant screen outside `src/app/`.

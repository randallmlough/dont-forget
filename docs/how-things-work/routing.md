# Routing

Don't Forget uses Expo Router with route groups. Route groups organize files without changing URLs.

## File Tree

```text
apps/mobile/app/
  _layout.tsx
  (app)/
    _layout.tsx
    index.tsx
    profile.tsx
    settings.tsx
    settings/
      appearance.tsx
    household/
      members.tsx
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
```

Current screen routes:

| URL | Route File | Screen |
| --- | --- | --- |
| `/` | `apps/mobile/app/(app)/index.tsx` | `apps/mobile/src/screens/app/home-screen.tsx` |
| `/settings` | `apps/mobile/app/(app)/settings.tsx` | `apps/mobile/src/screens/app/settings-screen.tsx` |
| `/settings/appearance` | `apps/mobile/app/(app)/settings/appearance.tsx` | `apps/mobile/src/screens/app/settings/appearance-screen.tsx` |
| `/profile` | `apps/mobile/app/(app)/profile.tsx` | `apps/mobile/src/screens/app/profile-screen.tsx` |
| `/household/settings` | `apps/mobile/app/(app)/household/settings.tsx` | `apps/mobile/src/screens/app/household/household-settings-screen.tsx` |
| `/household/members` | `apps/mobile/app/(app)/household/members.tsx` | `apps/mobile/src/screens/app/household/members-invitations-screen.tsx` |
| `/household/switch` | `apps/mobile/app/(app)/household/switch.tsx` | `apps/mobile/src/screens/app/household/household-switch-screen.tsx` |
| `/sign-in` | `apps/mobile/app/(auth)/sign-in.tsx` | `apps/mobile/src/screens/auth/sign-in-screen.tsx` |
| `/sign-up` | `apps/mobile/app/(auth)/sign-up.tsx` | `apps/mobile/src/screens/auth/sign-up-screen.tsx` |
| `/households/join` | `apps/mobile/app/households/join.tsx` | `apps/mobile/src/screens/households/join-screen.tsx` |
| `/invitations/accept` | `apps/mobile/app/invitations/accept.tsx` | `apps/mobile/src/screens/invitations/accept-screen.tsx` |

## Root Layout

`apps/mobile/app/_layout.tsx` owns app-wide providers and routing side effects:

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

`apps/mobile/app/(app)/_layout.tsx` owns signed-in product providers. It mounts the Authenticated App Session provider around signed-in routes, and that provider activates the app-owned Authenticated App Session and exposes session state/actions to screens.

Screens consume `useAuthenticatedAppSession()`. They should not manage the PowerSync connection or session resources directly, and they should not own sync lifecycle.

See [Authenticated App Session](./authenticated-app-session.md) for the provider boundary, state model, replacement policy, and sign-out cleanup contract.

## Auth Gate

`AuthGate` uses the current pathname, Clerk state, persisted-session status, and
Authenticated App Session metadata. A different-User local-data block has first
precedence and forces `/`, where Home renders recovery before mounting any
product queries. Next, a session that requires sign-in keeps auth routes
reachable. Existing ready/loading, onboarding, public-link intent, and
signed-out redirect behavior follows after those states.

The session-owned sign-out action runs in this order:

```ts
await clearAuthenticatedAppSessionPresent();
await signOut();
await bestEffort(db.disconnect());
await bestEffort(clearUserCurrentListSelections(userId));
track("user_signed_out", {});
reset();
```

Persisted-session clearing and Clerk Sign Out are critical. PowerSync disconnect
and the outgoing User's Current List selection cleanup are best effort. Sign Out
retains local product rows, queued writes, and durable database ownership. If a
critical step fails, successful Sign Out analytics are not emitted; the
provider dispatches the failed event and can restart activation while auth
still reports signed in.

## Adding Routes

Add authenticated app routes under `apps/mobile/app/(app)`. Add signed-out auth routes under `apps/mobile/app/(auth)`. Create another route group only when that group needs shared navigation options, providers, or a clear route boundary.

Keep route files thin. Prefer this shape:

```tsx
export { default } from "@mobile/screens/app/example-screen";
```

Put screen-owned code in `apps/mobile/src/screens/`. Keep feature UI, hooks, and services in `apps/mobile/src/features/<feature>/`; put reusable UI primitives in `apps/mobile/src/ui/`.

## Tests

Do not put tests in `apps/mobile/app/`; Expo Router treats files there as route entries. Route and screen behavior tests live next to the relevant screen outside that route tree.

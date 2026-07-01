# Routing

Don't Forget uses Expo Router with route groups. Route groups organize files without changing URLs.

## File Tree

```text
app/
  _layout.tsx
  (app)/
    _layout.tsx
    index.tsx
  (auth)/
    _layout.tsx
    sign-in.tsx
    sign-up.tsx
```

Current public routes:

| URL | Route File | Screen |
| --- | --- | --- |
| `/` | `app/(app)/index.tsx` | `screens/home/home-screen.tsx` |
| `/sign-in` | `app/(auth)/sign-in.tsx` | `screens/auth/sign-in-screen.tsx` |
| `/sign-up` | `app/(auth)/sign-up.tsx` | `screens/auth/sign-up-screen.tsx` |

## Root Layout

`app/_layout.tsx` owns app-wide providers and routing side effects:

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

`app/(app)/_layout.tsx` owns signed-in product providers. It mounts the Authenticated App Session provider around signed-in routes, and that provider eagerly activates the app-owned Authenticated App Session controller and exposes session state/actions to screens.

Screens consume `useAuthenticatedAppSession()`. They should not manage the PowerSync connection or session resources directly, and they should not own sync lifecycle.

See [Authenticated App Session](./authenticated-app-session.md) for the controller/provider boundary, snapshot model, replacement policy, and sign-out cleanup contract.

## Auth Gate

`AuthGate` uses the current pathname to detect signed-out auth routes. Signed-out Users are redirected to `/sign-in`; signed-in Users are redirected away from auth routes to `/`.

The session-owned sign-out action runs in this order:

```ts
track("user_signed_out", {});
reset();
const disposal = await authenticatedAppSessionController.dispose();
await clearSignedOutSessionData(disposal.householdIdsForLocalDataDeletion);
await signOut();
```

Cached Authenticated App Session metadata clearing and local synced-data clearing (PowerSync `disconnectAndClear`)
remain separate operations so authenticated app session resources can be stopped and
closed before destructive local cleanup. Controller disposal and local cleanup
failures are logged and do not block Clerk sign-out.

## Adding Routes

Add authenticated app routes under `app/(app)`. Add signed-out auth routes under `app/(auth)`. Create another route group only when that group needs shared navigation options, providers, or a clear route boundary.

Keep route files thin. Prefer this shape:

```tsx
export { default } from "@/screens/example/example-screen";
```

Put screen-owned code in `screens/<surface>/`. Put reusable product components in `components/`.

## Tests

Do not put tests in `app/`; Expo Router treats files there as route entries. Route and screen behavior tests live next to the relevant screen outside `app/`.

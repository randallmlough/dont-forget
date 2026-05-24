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

`app/(app)/_layout.tsx` owns signed-in product providers. The active Household provider belongs here: it eagerly activates the app-owned active Household controller for signed-in routes and exposes controller state to screens.

Individual screens consume active Household state and actions from the provider. They should not open or close Household DB resources or own sync coordinator lifecycle.

## Auth Gate

`AuthGate` uses the current pathname to detect signed-out auth routes. Signed-out Users are redirected to `/sign-in`; signed-in Users are redirected away from auth routes to `/`.

The sign-out order must remain:

```ts
track("user_signed_out", {});
reset();
await activeHouseholdController.dispose();
await clearCachedHouseholdSession();
await signOut();
```

## Adding Routes

Add authenticated app routes under `app/(app)`. Add signed-out auth routes under `app/(auth)`. Create another route group only when that group needs shared navigation options, providers, or a clear route boundary.

Keep route files thin. Prefer this shape:

```tsx
export { default } from "@/screens/example/example-screen";
```

Put screen-owned code in `screens/<surface>/`. Put reusable product components in `components/`.

## Tests

Do not put tests in `app/`; Expo Router treats files there as route entries. Route and screen behavior tests live next to the relevant screen outside `app/`.

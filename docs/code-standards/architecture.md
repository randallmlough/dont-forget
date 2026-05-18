# Architecture

## Domain Language

- **Must** use the domain language from `CONTEXT.md`: Household, Member, Owner, User, List, Item, Invitation, and Home.
- **Must** not introduce replacement language such as group, team, account, todo, task, invite link, dashboard, or landing page unless the glossary changes first.
- **Should** name components, props, events, logs, and tests with product language instead of generic placeholders.

## App Structure And Routing

- **Must** keep Expo Router route files in `app/` thin when practical.
- **Must** put route-owned UI and screen-local side effects in `screens/<surface>/`.
- **Must** colocate route-owned hooks, reducers, state-machine helpers, and helper types under the owning `screens/<surface>/` directory.
- **Must** put reusable app UI in `components/`.
- **Must** keep reusable component-owned hooks inside that component's directory when they are not app-wide APIs.
- **Must** use route groups consistently: `app/(app)` for authenticated app routes and `app/(auth)` for signed-out auth routes.
- **Must** not add Android or Web compatibility paths unless the platform policy changes.
- **Should** extract app-owned behavior shared across screens or features to `lib/app/`.
- **Should** extract server or operator behavior to `lib/server/`.
- **Should** use `.ios.tsx` files over runtime platform branching for substantial iOS-specific implementations.
- **Avoid** generic root `hooks/`, `utils/`, `helpers/`, or `types/` folders unless there is a documented architecture reason.
- **Avoid** exporting internal hooks or reducers from feature entrypoints unless another feature has a real dependency on them.

See also: [`docs/best-practices/expo-app-structure.md`](../best-practices/expo-app-structure.md) and [`docs/how-things-work/routing.md`](../how-things-work/routing.md).

## Providers And Auth

- **Must** not add duplicate Clerk or PostHog providers.
- **Must** keep app-wide providers in `app/_layout.tsx` unless a documented architecture change moves them.
- **Must** call `setActive(...)` after successful Clerk auth attempts.
- **Must** sign out in this order: track `user_signed_out`, reset analytics, clear local Household cache/DB files when that path exists, then call `signOut()`.

## Data Boundaries

- **Must** keep directory data and Household data separate: directory DB owns Users, Households, Memberships, and Invitations; each Household DB owns Lists, Items, and `item_checks`.
- **Must** not perform cross-Household SQL joins.
- **Must** write tombstones (`deleted_at`) on app delete paths for replicated data instead of hard deletes.
- **Must** preserve `item_checks` as separate checked-state data to avoid high-collision Item conflicts.
- **Should** keep database access behind app-owned adapters or server helpers rather than importing database clients directly into presentational UI.

## Server And Environment Safety

- **Must** keep Expo API route modules thin and lazy-load server-only helpers inside request handlers when those imports would otherwise affect native route registration.
- **Must** expose only public config through Expo `extra`.
- **Must** not expose Turso platform tokens, Clerk secrets, Resend secrets, or other server/operator secrets to client code.
- **Must** use `APP_ENV` as the app-owned backend selector.

See also: [`docs/how-things-work/environments.md`](../how-things-work/environments.md).

## Observability

- **Must** send product analytics through `track`, `screen`, and `reset` from `lib/analytics.ts`.
- **Must** add or change analytics events in `lib/analytics-events.ts` before calling them.
- **Must** send diagnostic logs through `useLogger()` in React and `logger` elsewhere.
- **Must** pass raw `Error` instances as `{ error }` in log attributes.
- **Must** log unexpected operational errors at the boundary where the app has enough context to explain what failed.
- **Must** not call PostHog directly from feature code.

See also: [`docs/how-things-work/analytics.md`](../how-things-work/analytics.md) and [`docs/how-things-work/logging.md`](../how-things-work/logging.md).

# Architecture

## Domain Language

- **Must** use the domain language from `CONTEXT.md`: Household, Member, Owner, User, List, Item, Invitation, Household Join Code, Home, and Authenticated App Session.
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
- **Must** put new product data access in the domain-first service layer under `lib/services/<domain>/`.
- **Must** treat top-level `lib/app/` and `lib/server/` as legacy locations. Do not add new data-access modules there; migrate touched code into `lib/services/`.
- **Should** use `.ios.tsx` files over runtime platform branching for substantial iOS-specific implementations.
- **Avoid** generic root `hooks/`, `utils/`, `helpers/`, or `types/` folders unless there is a documented architecture reason.
- **Avoid** exporting internal hooks or reducers from feature entrypoints unless another feature has a real dependency on them.

See also: [`docs/how-things-work/app-structure.md`](../how-things-work/app-structure.md), [`docs/how-things-work/routing.md`](../how-things-work/routing.md), [`docs/how-things-work/services.md`](../how-things-work/services.md), [`docs/how-things-work/api-routes.md`](../how-things-work/api-routes.md), and [ADR-0011](../adr/0011-domain-first-service-layer.md).

## Service Layer

- **Must** choose the service folder by domain or app-runtime boundary first: `auth`, `household`, `invitation`, `item`, `list`, `member`, `session`, or `user`.
- **Must** use factory-based service construction with explicit dependency types: `create<Domain>Service`, `<Domain>Service`, and `<Domain>ServiceDeps`.
- **Must** keep server-only service code under `lib/services/<domain>/server/`.
- **Must** not add a root `lib/services/index.ts` barrel.
- **Must** not import or export `./server` from an app-safe `lib/services/<domain>/index.ts`.
- **Must** keep `app/api/**` server-service imports dynamic inside request handlers until a better Expo API Route bundling solution is proven.
- **Must** enforce server-service import boundaries with the repo ESLint rule.
- **Must** keep SQL and DB-client access inside service implementations. Screens, components, hooks, and reusable UI must not execute SQL or import DB clients/stores directly.
- **Must** inject logger and analytics dependencies into services and stores that need observability instead of forcing those modules to mock global singletons in tests or non-app processes.
- **Must** keep reusable component contracts UI-facing. Compose services into component data sources at the owning controller or feature boundary; screens should consume those boundaries instead of opening Household data resources directly.
- **Must** return domain-shaped records from services, not UI component types and not raw SQL rows.
- **Must** generate IDs inside services for newly-created domain records. Service callers and normal tests must not inject or prescribe IDs.
- **Must** let services own timestamp generation directly. Do not add clock/time-provider dependencies to service dependency objects; tests that need deterministic timestamp behavior should spy on `Date.now()` at the test boundary.
- **Should** start with one service file per domain and split only when independent seams appear.
- **Should** use `HouseholdStore` as the app-owned infrastructure seam for local synced Household data. Do not name this `*-db-service`.
- **Should** keep List and Item services separate; route-owned List loading should call them by explicit List ID after authenticated app session context exists.
- **Avoid** letting domain services automatically sync remote state after every mutation. Local Household writes should resolve on local commit; sync timing belongs to the Authenticated App Session controller and sync coordinator.

## Single-Responsibility Functions

- **Must** keep functions focused on one clear responsibility.
- **Should** break apart functions that coordinate several concepts at once, such as auth readiness, cached data, fresh data, stale-run guards, resource replacement, cache writes, cleanup, and error recovery.
- **Should** extract named helpers for distinct phases so the top-level function reads as orchestration rather than implementation detail.
- **Should** use small, intention-revealing helper names that describe the business or lifecycle step being performed.
- **Avoid** dense multi-branch functions with mutable flag clusters that require readers to hold many invariants in their head.
- **Avoid** mixing decision-making, side effects, resource cleanup, persistence, and error recovery in one function unless the function is only delegating to focused helpers.

## Providers And Auth

- **Must** not add duplicate Clerk or PostHog providers.
- **Must** keep app-wide providers in `app/_layout.tsx` unless a documented architecture change moves them.
- **Must** keep root layout effects limited to app-wide provider, navigation, analytics, auth, theme, and native SDK lifecycle synchronization.
- **Must** keep feature-specific data loading and mutation lifecycle out of `app/_layout.tsx`.
- **Must** initialize signed-in authenticated app session infrastructure from the authenticated route group (`app/(app)/_layout.tsx`) through an app-owned provider, not from an individual screen.
- **Must** make screens and reusable components borrow controller-owned authenticated app session resources and actions; they must not open or close HouseholdStore resources directly.
- **Must** create provider-owned controllers, resource managers, and long-lived service adapters with lazy initialization, not render-time ref assignment.
- **Must** make provider activation, subscription, and disposal effects depend on the owned controller or resource identity.
- **Must** keep sign-out, disposal, cleanup, and recovery order centralized in the owning runtime module instead of duplicating it in components.
- **Must** keep auth routing effects separate from cache probes and native SDK warmup effects.
- **Must** derive effective auth and cache state from authoritative auth readiness state instead of storing duplicate signed-in or signed-out booleans.
- **Must** call `setActive(...)` after successful Clerk auth attempts.
- **Must** sign out in this order: track `user_signed_out`, reset analytics, dispose authenticated app session resources, clear local Household cache/DB files when that path exists, clear local Current List selections for the signed-out app User, then call `signOut()`.
- **Should** use `useEffectEvent` when an effect needs the latest callback without reactivating provider lifecycle.
- **Should** extract root effect logic into named hooks when it has branching, cleanup, or testable behavior.
- **Should** keep route membership checks inside the redirect effect when the result is only used for navigation synchronization.
- **Avoid** using root layout as a catch-all initialization file for feature state.

## Data Boundaries

- **Must** keep directory data and Household data separate: directory DB owns Users, Households, Memberships, and Invitations; each Household DB owns Lists, Items, and `item_checks`.
- **Must** not perform cross-Household SQL joins.
- **Must** write tombstones (`deleted_at`) on app delete paths for replicated data instead of hard deletes.
- **Must** preserve `item_checks` as separate checked-state data to avoid high-collision Item conflicts.
- **Must** keep database access behind domain services rather than importing database clients directly into presentational UI.
- **Must** serialize operations inside any app-owned store or DB wrapper that shares one native/local database handle across reads, writes, sync, and close. Use `createDatabaseOperationQueue()` from `db/utils.ts` so failed operations do not break the queue and later operations still run. See the [offline Item sync post-mortem](../post-mortem/2026-05-20-offline-item-sync.md) for the failure mode that led to this rule.

## Server And Environment Safety

- **Must** keep Expo API route modules thin and lazy-load server-only helpers inside request handlers when those imports would otherwise affect native route registration.
- **Must** follow the `app/api` -> `lib/api` -> `lib/services` boundary from [`docs/how-things-work/api-routes.md`](../how-things-work/api-routes.md) for new or changed HTTP behavior, except for explicitly documented legacy routes awaiting migration.
- **Must** expose only public config through Expo `extra`.
- **Must** not expose Turso platform tokens, Clerk secrets, Resend secrets, or other server/operator secrets to client code.
- **Must** use `APP_ENV` as the app-owned backend selector.

See also: [`docs/how-things-work/environments.md`](../how-things-work/environments.md).

## Observability

- **Must** send product analytics through `track`, `screen`, and `reset` from `lib/analytics.ts`.
- **Must** add or change analytics events in `lib/analytics-events.ts` before calling them.
- **Must** treat analytics events and property shapes as typed product contracts.
- **Must** name analytics events by user or domain outcome, not UI implementation details.
- **Must** track analytics from the event or action boundary that knows what happened, not from effects that infer it later.
- **Must** send diagnostic logs through `useLogger()` in React, injected `Logger` dependencies in services/stores, and `logger` elsewhere when no caller-owned dependency seam exists.
- **Must** pass typed analytics dependencies into services/stores that own product outcomes instead of calling PostHog directly or depending on untyped event bags.
- **Should** emit service analytics from service methods after successful user-visible or domain outcomes, not from exploratory diagnostics or error paths.
- **Must** pass raw `Error` instances as `{ error }` in log attributes.
- **Must** log unexpected operational errors at the boundary where the app has enough context to explain what failed.
- **Must** log unexpected async failures once at the boundary that has operation context.
- **Must** avoid logging expected validation or user-correctable states as errors.
- **Must** not call PostHog directly from feature code.
- **Should** test analytics when an event represents an important product funnel, auth flow, Invitation flow, or destructive action.
- **Avoid** tracking derived state changes in effects unless the product event is genuinely "screen became visible" or "identity changed."
- **Should** include safe, non-sensitive domain context such as Household, List, or Item IDs when it helps diagnose the failure.
- **Avoid** logging and rethrowing at multiple layers unless each layer adds meaningful context.

See also: [`docs/how-things-work/analytics.md`](../how-things-work/analytics.md) and [`docs/how-things-work/logging.md`](../how-things-work/logging.md).

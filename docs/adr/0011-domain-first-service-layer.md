# Domain-first service layer

_Amended 2026-06-30 ([ADR-0018](0018-single-postgres-self-hosted-powersync.md)): the domain-first layout, factory DI, naming, and SQL-stays-in-services rules are unchanged, but the app-side data store is now the PowerSync `ProductDatabase` seam, not `HouseholdStore`, and the session runtime slice below has lost the per-Household resource/cache/lease machinery and Household provisioning._

The application needs one primary pattern for querying and mutating product data. Earlier app code split this behavior between top-level `lib/app/` and `lib/server/` modules, with feature-specific adapters such as `active-list-adapter`. That made it hard to answer where a new User, Household, List, Item, Member, or Invitation operation should live.

We will organize data access through a domain-first service layer under `lib/services/`. Services are the primary entrypoint for product data reads and writes. Top-level `lib/app/` and `lib/server/` are legacy locations: new data-access code must not be added there, and touched code should migrate into `lib/services/`.

## Decision

- Use domain folders as the top-level service boundary:

  ```txt
  lib/services/
    auth/
    household/
    invitation/
    item/
    list/
    member/
    user/
  ```

- Keep runtime-specific code nested inside the owning domain. Server-only service implementations live under `lib/services/<domain>/server/`.
- Allow app-safe domain indexes such as `lib/services/item/index.ts`. These indexes must never import or export from `./server`.
- Allow server domain indexes such as `lib/services/household/server/index.ts` for API route/server imports.
- Do not add a root `lib/services/index.ts` barrel.
- Continue to lazy-load server services inside `app/api/**` request handlers until a better Expo API Route bundling solution is proven.
- Enforce service import boundaries with a custom ESLint rule.
- Services use factory-based dependency injection:

  ```ts
  export type ItemService = {
    addItem(input: AddItemInput): Promise<Item>;
  };

  export type ItemServiceDeps = {
    householdId: string;
    store: ProductDatabase;
  };

  export function createItemService(deps: ItemServiceDeps): ItemService;
  ```

- The `ProductDatabase` seam (`lib/services/shared/product-database.ts`) is the app-owned infrastructure boundary for the local PowerSync data store, exposing `watch()` / `writeTransaction()` / `getAll` / `getOptional` / `execute`. It is not a service and should not be named `*-db-service`. _Superseded by [ADR-0018](0018-single-postgres-self-hosted-powersync.md): the former `HouseholdStore` SQL executor (placed in the db layer by [ADR-0014](0014-db-layer-owns-data-store-infrastructure.md)) is deleted; the app now talks to one PowerSync database through this seam._
- Services own SQL directly for now. Screens, components, hooks, and reusable UI must not execute SQL or import DB clients/stores directly.
- Server services may use Drizzle/directory DB infrastructure directly. App-safe services may use the `ProductDatabase` seam; they must not import server/operator secrets, `@clerk/backend`, or the server Postgres client.
- List and Item are separate service folders. Route-owned List loading composes them into UI state by explicit List ID after authenticated app session context exists.
- Reusable components keep UI-facing data-source contracts. The service layer owns CRUD; authenticated app session controller or feature-boundary composition adapts services into component contracts.
- Services return domain-shaped records, not UI component types and not raw SQL rows.
- One service file per domain is the starting point; split command/query/use-case files only when real pressure appears.
- Domain services write to the local PowerSync database through the `ProductDatabase` seam. PowerSync streams those writes to `/api/data` continuously, so there is no separate sync-timing policy for List or Item services to own.
- Services generate IDs internally. Service callers and normal tests must not inject or prescribe IDs for newly-created domain records, except in rare migration/fixture utilities outside normal service APIs.
- Services own timestamp generation internally. Do not expose clock or time-provider dependencies from normal services; tests that need deterministic timestamp behavior should spy on `Date.now()` at the test boundary.
- Services and stores accept logger and analytics dependencies when they own diagnostics or product events. They may default to the app-owned logger/analytics helpers at the service/store boundary, but tests and non-app processes should be able to inject their own observability adapters.

## Naming

- Factory: `create<Domain>Service`
- Service type: `<Domain>Service`
- Dependency type: `<Domain>ServiceDeps`
- Operation input: `<Operation>Input`
- Operation result: `<Operation>Result` only when needed

## Current authenticated session runtime slice

The signed-in app runtime uses a separate session service area; product storage and domain operations sit in the domain service areas over the shared PowerSync `ProductDatabase` seam:

```txt
lib/services/session/
  bootstrap.ts
  controller.ts             # composes list/item services over the PowerSync store
  powersync-app-database.ts # wraps the PowerSync handle as the ProductDatabase seam
  sign-out.ts
  server/
    bootstrap.ts

lib/services/household/
  server/
    household-service.ts

lib/services/list/list-service.ts
lib/services/item/item-service.ts
lib/services/shared/product-database.ts   # the ProductDatabase seam
```

As part of that slice:

- Keep reusable UI contracts explicit: loaded List state plus callbacks for loading, adding Items, and checking Items.
- The session controller opens the PowerSync database once and injects the `ProductDatabase` seam into the List and Item services; there is no per-Household resource set, cache, or lease to compose.
- Keep List and Item data loading route-owned by explicit List ID after the Authenticated App Session exists.
- Keep Household domain server services (create, rename, membership, join code) under `lib/services/household/server/`; the two-phase provisioning service is deleted (ADR-0018, Decision 6).
- Keep the `/api/data` write applicator and the server Postgres client under `db/server/`, not the Household service layer.

[ADR-0012](0012-authenticated-app-session-controller.md) supersedes the Home-owned resource ownership from the initial Home/List/Item slice. Authenticated App Session resource composition belongs to `lib/services/session/controller.ts`, with screens borrowing provider-owned session state and actions.

## Considered options

- **Keep top-level `lib/app/` and `lib/server/`.** Rejected because the boundary is runtime-shaped rather than domain-shaped and makes names such as Household service vs Household DB wrapper ambiguous.
- **Physically merge all app and server services into one flat module tree.** Rejected because server-only imports can leak secrets or incompatible packages into the Expo app bundle.
- **Use repositories beneath services immediately.** Rejected for now because this would mostly create pass-through layers. The important rule is that SQL stays inside service implementations.
- **Let domain services sync after every mutation.** Rejected because offline-first mutations should resolve on local commit; remote propagation has its own lifecycle.

## Consequences

- New product data access should be easier to place: choose the domain first, then the runtime-specific subfolder only if needed.
- Future agents and humans must consult `docs/code-standards/architecture.md` and `docs/how-things-work/services.md` before adding data-access code.
- The ESLint boundary rule becomes part of the architecture, not merely style.
- Some existing files will remain in legacy locations until migrated by vertical slices.
- The service layer does not remove the Expo API Route lazy-import requirement.

# Domain-first service layer

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
    store: HouseholdStore;
  };

  export function createItemService(deps: ItemServiceDeps): ItemService;
  ```

- `HouseholdStore` is the app-owned infrastructure seam for the local synced Household data store. It is not a service and should not be named `*-db-service`.
- Services own SQL directly for now. Screens, components, hooks, and reusable UI must not execute SQL or import DB clients/stores directly.
- Server services may use Drizzle/directory DB infrastructure directly. App-safe services may use `HouseholdStore`; they must not import server/operator secrets, `@clerk/backend`, Turso Platform clients, or `@libsql/client` server entrypoints.
- List and Item are separate service folders. The active Household controller may compose them into one Current List experience for reusable UI.
- Reusable components keep UI-facing data-source contracts. The service layer owns CRUD; active Household controller or feature-boundary composition adapts services into component contracts.
- Services return domain-shaped records, not UI component types and not raw SQL rows.
- One service file per domain is the starting point; split command/query/use-case files only when real pressure appears.
- Domain services commit local Household writes only. Sync timing is an application/controller policy owned by active Household infrastructure, not by List or Item services.
- Services generate IDs internally. Service callers and normal tests must not inject or prescribe IDs for newly-created domain records, except in rare migration/fixture utilities outside normal service APIs.
- Services own timestamp generation internally. Do not expose clock or time-provider dependencies from normal services; tests that need deterministic timestamp behavior should spy on `Date.now()` at the test boundary.
- Services and stores accept logger and analytics dependencies when they own diagnostics or product events. They may default to the app-owned logger/analytics helpers at the service/store boundary, but tests and non-app processes should be able to inject their own observability adapters.

## Naming

- Factory: `create<Domain>Service`
- Service type: `<Domain>Service`
- Dependency type: `<Domain>ServiceDeps`
- Operation input: `<Operation>Input`
- Operation result: `<Operation>Result` only when needed

## Initial migration slice

The initial migration slice used the Home/List/Item vertical slice:

```txt
lib/services/household/household-store.ts
lib/services/household/household-session-service.ts
lib/services/household/current-list-data-source.ts
lib/services/list/list-service.ts
lib/services/item/item-service.ts
```

As part of that slice:

- Use `ActiveListDataSource` naming for the reusable UI boundary instead of adapter naming.
- Remove old Active List factory call sites rather than keeping compatibility wrappers.
- Move `bootstrapWithClerk` and offline Household Session cache behavior into Household Session service naming.
- Open one shared `HouseholdStore` for the first Home-rendered List and inject it into List and Item services.
- Keep the production Current List data-source helper under `lib/services/household/`, with Home temporarily consuming it until the Active Household controller/provider slice takes over.

Server bootstrap/user/member/provisioning services may migrate after this app-side slice proves the pattern.

ADR-0012 supersedes the Home-owned active Household resource ownership from this initial slice. New active Household resource composition belongs to the Active Household controller under `lib/services/household/`, with screens borrowing controller-owned state and actions.

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

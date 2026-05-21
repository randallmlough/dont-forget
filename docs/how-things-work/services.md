# Services

Services are the primary entrypoint for querying and mutating product data in Don't Forget. They are organized by domain first, not by runtime first. See [ADR-0011](../adr/0011-domain-first-service-layer.md) for the decision record and [`docs/code-standards/architecture.md`](../code-standards/architecture.md) for mandatory rules.

## Folder Shape

Use the domain noun from `CONTEXT.md` as the folder name:

```txt
lib/services/
  auth/
    index.ts
    auth-service.ts
    server/
      index.ts
      auth-service.ts
  household/
    index.ts
    household-session-service.ts
    household-store.ts
    household-service.ts
    server/
      index.ts
      household-bootstrap-service.ts
      household-provisioning-service.ts
      household-service.ts
      turso-platform.ts
  invitation/
  item/
    index.ts
    item-service.ts
  list/
    index.ts
    list-service.ts
  member/
    server/
      index.ts
      member-service.ts
  user/
    server/
      index.ts
      user-service.ts
```

Rules:

- `lib/services/<domain>/index.ts` is app-safe and may export app-safe service APIs only.
- `lib/services/<domain>/server/index.ts` may export server-only APIs for API routes and server tests.
- There is no root `lib/services/index.ts` barrel.
- Top-level `lib/app/` and `lib/server/` are legacy locations. Do not add new data-access modules there.

## Runtime Boundary

Domain-first does not mean app and server code can freely import each other.

App-safe services must not import:

- `@clerk/backend`
- Turso Platform clients or operator config
- server-only environment readers such as `readTursoOperatorConfig` or `readClerkServerConfig`
- `@libsql/client` server/HTTP entrypoints
- Drizzle directory DB clients
- anything under `lib/services/**/server/**`

Server services live under `server/` because they may use secrets, Clerk server APIs, Turso platform APIs, Drizzle, and directory DB clients.

Expo API Routes must keep server imports lazy inside request handlers:

```ts
export async function POST(request: Request): Promise<Response> {
  const [{ directoryClient }, authServer, householdServer] = await Promise.all([
    import("@/db/client"),
    import("@/lib/services/auth/server"),
    import("@/lib/services/household/server"),
  ]);

  // ...
}
```

This preserves the current native bundle safety behavior until a better Expo API Route bundling proof exists.

## Service Style

Use factory-based dependency injection:

```ts
import { track } from "@/lib/analytics";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

type ItemServiceAnalytics = {
  track: typeof track;
};

export type ItemService = {
  addItem(input: AddItemInput): Promise<Item>;
  listItems(input: ListItemsInput): Promise<Item[]>;
  setItemChecked(input: SetItemCheckedInput): Promise<void>;
};

export type ItemServiceDeps = {
  householdId: string;
  store: HouseholdStore;
  logger?: Logger;
  analytics?: ItemServiceAnalytics;
};

export function createItemService(deps: ItemServiceDeps): ItemService {
  const log = (deps.logger ?? defaultLogger).with({
    household_id: deps.householdId,
    service: "item",
  });
  const analytics = deps.analytics ?? { track };
  // ...
}
```

Naming conventions:

- `create<Domain>Service`
- `<Domain>Service`
- `<Domain>ServiceDeps`
- `<Operation>Input`
- `<Operation>Result` only when needed

Production call sites should stay clean:

```ts
import { track } from "@/lib/analytics";
import { useLogger } from "@/lib/logger";

const logger = useLogger();
const analytics = { track };

const store = await openHouseholdStore({
  householdId: session.activeHousehold.id,
  database: session.householdDatabase,
  logger,
});

const listService = createListService({
  householdId: session.activeHousehold.id,
  store,
  logger,
  analytics,
});

const itemService = createItemService({
  householdId: session.activeHousehold.id,
  store,
  logger,
  analytics,
});
```

Use optional dependencies sparingly. Services own ID generation and timestamp generation directly; do not add clock/time-provider dependencies to services. Tests that need deterministic timestamp behavior should spy on `Date.now()` at the test boundary instead of introducing service dependency shape that production callers could cargo-cult.

Logger and analytics dependencies are the observability exception to that rule. Services and stores that log diagnostics or track product outcomes should accept `logger` and/or `analytics` through their dependency object or open config, then default to the app-owned implementation at the service/store boundary. This keeps tests and non-app processes from mocking global modules, while preserving app-owned redaction and typed event contracts.

Service methods should emit informative product tracking after successful operations when the method owns a user-visible or domain outcome, such as loading an online Household Session, saving an offline-capable cache, creating an Item, or sending an Invitation. Do not track exploratory diagnostics, expected validation failures, or reads that do not represent a meaningful product outcome.

Scope injected analytics to the operations a service actually needs. For example, prefer `{ track: typeof track }` for a service that only emits product events, rather than a broad dependency bag with unused `identify`, `reset`, or `screen` functions. Do not inject analytics into a service or store that does not own a product outcome.

Do not inject generated IDs into normal services. New domain record IDs are generated inside the service. Tests should assert ID shape and consistency, not exact random values.

Do not inject clocks into services. If a service writes app-owned timestamps, generate them inside the service and keep any monotonicity guard local to that service.

## HouseholdStore

`HouseholdStore` is the app-owned infrastructure seam around the local synced Household data file. It is not a service and should not be named `*-db-service`.

Initial shape should stay minimal:

```ts
export type HouseholdStore = {
  path: string;
  syncAuthorized: boolean;
  execute(statement: HouseholdSqlStatement): Promise<HouseholdSqlResult>;
  push(): Promise<void>;
  pull(): Promise<HouseholdSyncResult>;
  sync(): Promise<HouseholdSyncResult>;
  close(): Promise<void>;
  deleteLocalData(): Promise<void>;
};

export type OpenHouseholdStoreConfig = {
  householdId: string;
  database: HouseholdDatabaseConfig;
  logger?: Logger;
};
```

Open one shared `HouseholdStore` for a Household workflow and inject it into the services that need it. For Home, the same store should be shared by List and Item services and closed by the Home-owned data source. `HouseholdStore` is infrastructure, so it usually logs diagnostics but should not emit product analytics unless the store itself owns a user-visible product outcome; most product events belong in the service, screen, or data-source operation that understands user intent.

Any app-owned store or DB wrapper that shares one native/local database handle must serialize operations through `createDatabaseOperationQueue()` from `db/utils.ts`. This includes reads, writes, sync operations, and close/delete paths. The queue is per store instance, not global. This prevents local writes and sync operations from racing on one handle, and it keeps later operations running even after one operation rejects. See the [offline Item sync post-mortem](../post-mortem/2026-05-20-offline-item-sync.md) for the original failure mode.

Defer transaction helpers until a real service operation needs them.

## SQL Ownership

Services own SQL directly for now.

Allowed:

- app-safe List/Item services executing SQL through `HouseholdStore`
- server User/Member/Household services using Drizzle/directory DB infrastructure
- server Household provisioning services using Turso Platform and Household DB migration infrastructure
- service tests injecting fake or local SQL stores

Not allowed:

- screens executing SQL
- components executing SQL
- hooks importing DB clients directly
- reusable UI importing `HouseholdStore`
- feature code importing Turso/Clerk server SDKs directly

Services should return domain-shaped records, not raw SQL rows and not component types.

```ts
export type Item = {
  id: string;
  listId: string;
  name: string;
  checked: boolean;
  checkedByUserId: string | null;
  position: number;
};
```

The owning screen maps domain records into UI contracts.

## UI Data Sources

Reusable components keep UI-facing contracts. They should not import domain services directly when that would couple them to Household Session, stores, or service factories.

For Home, the screen owns the composition:

```txt
screens/home/
  active-list-data-source.ts
  use-home-content.ts
```

The data source adapts List and Item services into the `ActiveList` component contract:

```ts
const list = await listService.getList({ listId });
const items = await itemService.listItems({ listId });

return {
  householdName: session.activeHousehold.name,
  listName: list.name,
  items: items.map(toActiveListItem),
};
```

The reusable component contract is named `ActiveListDataSource`; do not reintroduce adapter aliases at the UI boundary.

## Offline-First Sync Semantics

Turso Sync is local-first: List/Item reads and writes happen against the local Household DB. Explicit `push()` and `pull()` calls propagate changes when connectivity and authorization are available.

Domain services should resolve mutations on local commit:

```ts
const item = await itemService.addItem({ listId, userId, name });
```

They should not treat remote sync as part of mutation success. Sync timing is an application/runtime policy owned by the active Household sync coordinator:

```ts
const item = await itemService.addItem(input);
void syncCoordinator.requestSync({ reason: "localWrite" });
return item;
```

The coordinator chooses full sync or push-local-only behavior, serializes in-flight sync work, owns retry cadence while Home is active, and receives app lifecycle events through app-owned adapter seams. Keep future network-awareness behind the same coordinator boundary rather than pushing sync calls into List or Item services, UI components, or native package call sites. See [Household Sync Coordinator](./household-sync-coordinator.md) for the active Household sync policy.

Turso's transport conflict behavior is last-push-wins. App-owned timestamps remain useful for `created_at`, `updated_at`, latest checked-state display, recovery upserts, and future migration paths, but they are not Turso's merge clock.

## Household Session

Use **Household Session** for the app's active Household context: active Household, active Member, active List, Members, and short-lived Household DB connection metadata needed to open Home.

Preferred naming:

- `getHouseholdSession`, not `bootstrapWithClerk`
- `CachedHouseholdSession`, not `CachedBootstrapMetadata`
- `household-session-service.ts`, not `offline-bootstrap-cache.ts`

Cached Household Sessions must not store Household DB auth tokens. Offline Home startup may use cached non-secret metadata and the local Household DB file; push/pull authorization resumes only after a fresh online Household Session is obtained.

## Initial Migration Checklist

For the Home/List/Item vertical slice:

1. Create `lib/services/household/household-store.ts` from the existing Household DB wrapper.
2. Create `lib/services/household/household-session-service.ts` from bootstrap client and offline cache behavior.
3. Create `lib/services/list/list-service.ts` for List metadata operations.
4. Create `lib/services/item/item-service.ts` for Item operations.
5. Create `screens/home/active-list-data-source.ts` to compose Household Session, HouseholdStore, ListService, and ItemService.
6. Keep the Active List UI boundary on `ActiveListDataSource` naming.
7. Hard-cut imports away from touched `lib/app/*` files; do not add compatibility wrappers.
8. Add the custom ESLint service-boundary rule.
9. Run focused tests for Home, Active List, and migrated services, then `make verify` when practical.

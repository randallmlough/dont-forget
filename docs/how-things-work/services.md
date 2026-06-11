# Services

Services are the primary entrypoint for querying and mutating product data in Don't Forget. They are organized by domain first, with the signed-in app runtime isolated under `lib/services/session/`. See [ADR-0011](../adr/0011-domain-first-service-layer.md), [ADR-0014](../adr/0014-db-layer-owns-data-store-infrastructure.md), and [`docs/code-standards/architecture.md`](../code-standards/architecture.md).

## Folder Shape

Use the domain noun from `CONTEXT.md` as the service folder name. Runtime/session code gets its own session folder because it composes multiple domains for the signed-in app shell.

```txt
lib/services/
  auth/
    index.ts
  household/
    server/
      index.ts
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
  session/
    index.ts
    bootstrap.ts
    cache.ts
    controller.ts
    resource-manager.ts
    resource-lease.ts
    services.ts
    server/
      index.ts
      bootstrap.ts
  user/
    server/
      index.ts
      user-service.ts
```

Rules:

- `lib/services/<domain>/index.ts` is app-safe and may export app-safe APIs only.
- `lib/services/<domain>/server/index.ts` and `lib/services/session/server/index.ts` may export server-only APIs for API routes and server tests.
- There is no root `lib/services/index.ts` barrel.
- Top-level `lib/app/` and `lib/server/` are legacy locations. Do not add new data-access modules there.
- Data-store infrastructure is not a service and lives in the db layer (see ADR-0014): the `db/` root is app-safe (`db/schema/`, `db/utils.ts`, `db/household-store.ts`); everything touching `@libsql/client`, operator config, migrations, reset, or test seeding lives under `db/server/`.

## Runtime Boundary

Domain-first does not mean app and server code can freely import each other.

App-safe services must not import:

- `@clerk/backend`
- Turso Platform clients or operator config
- server-only environment readers such as `readTursoOperatorConfig` or `readClerkServerConfig`
- `@libsql/client` server/HTTP entrypoints
- Drizzle directory DB clients
- anything under `lib/services/**/server/**`
- anything under `db/server/`

Server services live under `server/` because they may use secrets, Clerk server APIs, Turso platform APIs, Drizzle, and directory DB clients.

Expo API Routes must keep server imports lazy inside request handlers:

```ts
export async function POST(request: Request): Promise<Response> {
  const [{ directoryClient }, authServer, sessionServer] = await Promise.all([
    import("@/db/server/client"),
    import("@/lib/services/auth/server"),
    import("@/lib/services/session/server"),
  ]);

  // ...
}
```

This preserves native bundle safety until a better Expo API Route bundling proof exists.

## Service Style

Use factory-based dependency injection:

```ts
import { track } from "@/lib/analytics";
import { logger as defaultLogger, type Logger } from "@/lib/logger";

export type ItemService = {
  addItem(input: AddItemInput): Promise<Item>;
  listItems(input: ListItemsInput): Promise<Item[]>;
  setItemChecked(input: SetItemCheckedInput): Promise<void>;
};

export type ItemServiceDeps = {
  householdId: string;
  store: HouseholdStore;
  logger?: Logger;
  analytics?: { track: typeof track };
};

export function createItemService(deps: ItemServiceDeps): ItemService {
  const log = (deps.logger ?? defaultLogger).with({
    household_id: deps.householdId,
    service: "item",
  });
  // ...
}
```

Naming conventions:

- `create<Domain>Service`
- `<Domain>Service`
- `<Domain>ServiceDeps`
- `<Operation>Input`
- `<Operation>Result` only when needed

Use optional dependencies sparingly. Services own ID generation and timestamp generation directly; tests that need deterministic time should spy on `Date.now()` at the test boundary. Logger and analytics are the normal observability exceptions.

Service methods should emit informative product tracking after successful operations when the method owns a user-visible or domain outcome, such as loading an online Authenticated App Session, saving an offline-capable cache, creating an Item, or sending an Invitation. Do not track exploratory diagnostics, expected validation failures, or reads that do not represent a meaningful product outcome.

## HouseholdStore

`HouseholdStore` is the app-owned infrastructure seam around the local synced Household data file. It is not a service and should not be named `*-db-service`. It lives in the db layer at `db/household-store.ts` (see ADR-0014), not under `lib/services/`, and also owns the store's sync contract: `SyncResult`, `SyncInterruptedError`, and the native sync-error classification. `SyncResult` is re-exported through `lib/services/sync` because app-facing code may only consume types through the service layer, never from `@/db`. Lint enforces that ban for `app/`, `screens/`, and `components/` (`no-db-imports-outside-services`); for other non-service `lib/` modules it is policy, not lint — follow it anyway.

Initial shape should stay minimal:

```ts
export type HouseholdStore = {
  path: string;
  syncAuthorized: boolean;
  execute(statement: HouseholdSqlStatement): Promise<HouseholdSqlResult>;
  push(): Promise<void>;
  pull(): Promise<SyncResult>;
  sync(): Promise<SyncResult>;
  close(): Promise<void>;
  deleteLocalData(): Promise<void>;
};
```

Open one shared `HouseholdStore` for a Household workflow and inject it into the services that need it. For signed-in app UI, the Authenticated App Session controller composes one store with List and Item services and closes it through controller-owned session resources.

Any app-owned store or DB wrapper that shares one native/local database handle must serialize operations through `createDatabaseOperationQueue()` from `db/utils.ts`. This includes reads, writes, sync operations, and close/delete paths. The queue is per store instance, not global.

## SQL Ownership

Services own SQL directly for now.

Allowed:

- app-safe List/Item services executing SQL through `HouseholdStore`
- server User/Member/Household services using Drizzle/directory DB infrastructure
- server Household provisioning services using Turso Platform and Household DB migration infrastructure
- session runtime code composing app-safe services for the Authenticated App Session
- service tests injecting fake or local SQL stores

Not allowed:

- screens executing SQL
- components executing SQL
- hooks importing DB clients directly
- reusable UI importing `HouseholdStore`
- feature code importing Turso/Clerk server SDKs directly

Services should return domain-shaped records, not raw SQL rows and not component types.

## UI Data Loading

Reusable components keep UI-facing contracts. They should not import domain services directly when that would couple them to Authenticated App Session, stores, or service factories. Route-owned hooks or containers adapt domain services into component props.

For signed-in UI, `components/session/AuthenticatedAppSessionProvider` exposes:

```ts
const { state, session, retry, signOut } = useAuthenticatedAppSession();
```

`state` is lifecycle/UI metadata only. `session` is top-level and nullable; when it is non-null, route-owned hooks may use session-scoped services:

```ts
const list = await session.services.lists.getList({ listId });
const items = await session.services.items.listItems({ listId });

return {
  householdName: session.activeHousehold.name,
  listName: list.name,
  items: items.map(toActiveListItem),
};
```

Current List is selection state only. Today Home selects `DEFAULT_LIST_ID`; future List switching should change the selected `listId`, not introduce a new Household-owned Current List service or data source. `ActiveList` receives loaded state and explicit callbacks such as `onLoadList`, `onAddItem`, and `onSetItemChecked`.

During safe cached-to-fresh replacement, the provider may expose `state: { status: "ready", refreshing: true }` with the previous `session`. The previous List UI remains writable until a replacement session is published. After replacement, the old borrowed session resource rejects new List/Item/sync calls with a typed stale-resource error and closes only after accepted operations drain.

If fresh authorization proves the cached Household is unauthorized, the controller retires cached resources before deleting local data and does not keep stale Household data visible.

See [Authenticated App Session](./authenticated-app-session.md) for the public boundary and replacement policy.

## Offline-First Sync Semantics

Turso Sync is local-first: List/Item reads and writes happen against the local Household DB. Explicit `push()` and `pull()` calls propagate changes when connectivity and authorization are available.

Domain services should resolve mutations on local commit:

```ts
const item = await itemService.addItem({ listId, userId, name });
```

They should not treat remote sync as part of mutation success. Sync timing is an application/controller policy owned by the Authenticated App Session controller and its sync coordinator:

```ts
const item = await session.services.items.addItem(input);
void session.services.sync.requestSync({ reason: "localWrite" });
return item;
```

The coordinator chooses full sync or push-local-only behavior, serializes in-flight sync work, owns retry cadence while the app is active, and receives app lifecycle and connectivity events through app-owned adapter seams. The Authenticated App Session controller owns when a Household coordinator exists, starts, stops, and is replaced. See [Sync Coordinator](./sync-coordinator.md).

`session.services.sync` is a narrowed consumer handle: route-owned UI may call `getStatus`, `subscribe`, and `requestSync`, but only the Authenticated App Session controller starts or stops the underlying coordinator.

## Authenticated App Session

Use **Authenticated App Session** for the top-level signed-in app runtime. It identifies the active Household, active Member, current Members, resource key, and session-scoped services. Do not put Current List, List, or Item state in the session; load those through `session.services` after `session !== null`.

Preferred app-side names:

- `getSessionBootstrap`, not `bootstrapWithClerk`
- `CachedSessionBootstrap`, not `CachedBootstrapMetadata`
- `lib/services/session/bootstrap.ts` for fresh online session loading
- `lib/services/session/cache.ts` for offline-capable non-secret cache behavior
- `lib/services/session/controller.ts` for signed-in runtime orchestration

Cached Authenticated App Sessions must not store Household DB auth tokens. Offline startup may use cached non-secret metadata and the local Household DB file; push/pull authorization resumes only after a fresh online Authenticated App Session is obtained.

## Historical Migration Note

The initial Home/List/Item migration introduced domain services and `HouseholdStore`. The current boundary supersedes the old Home-owned resource lifecycle: Authenticated App Session infrastructure exposes Household-scoped List and Item services, and route-owned code loads the selected List by explicit List ID.

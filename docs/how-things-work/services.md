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
      household-service.ts
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
    controller.ts
    powersync-app-database.ts
    sign-out.ts
    server/
      index.ts
      bootstrap.ts
  shared/
    product-database.ts
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
- Data-store infrastructure is not a service and lives in the db layer (see ADR-0014): the `db/` root is app-safe (`db/schema/`, `db/utils.ts`); everything touching the server Postgres client, operator config, migrations, reset, the `/api/data` write applicator (`db/server/sync/`), or test seeding lives under `db/server/`. The app-side PowerSync store lives in `lib/powersync/`.

## Runtime Boundary

Domain-first does not mean app and server code can freely import each other.

App-safe services must not import:

- `@clerk/backend`
- the server Postgres client or operator config
- server-only environment readers such as `readPostgresConfig` or `readClerkServerConfig`
- Drizzle directory DB clients
- anything under `lib/services/**/server/**`
- anything under `db/server/`

Server services live under `server/` because they may use secrets, Clerk server APIs, Drizzle, and the server Postgres client.

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
  store: ProductDatabase;
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

## PowerSync store and the ProductDatabase seam

The app's local product data lives in one PowerSync database (`@powersync/op-sqlite`) under `lib/powersync/`:

- `schema.ts` — the declarative `AppSchema` (client views over synced rows; there are no client migrations).
- `powersync.ts` — the `PowerSyncDatabase` singleton, opened over an `OPSqliteOpenFactory`.
- `connector.ts` — the backend connector: it fetches the connection token from Clerk and uploads local writes to `/api/data`.
- `provider.tsx` — the React provider that makes the database available to the app.

Services never import PowerSync directly. They depend on the narrow `ProductDatabase` seam (`lib/services/shared/product-database.ts`), which exposes `getAll` / `getOptional` / `execute` and a `writeTransaction(run)` that runs against a `ProductQuerier`. `lib/services/session/powersync-app-database.ts` adapts the PowerSync handle to this seam. Reactivity comes from PowerSync's `watch()` / onChange, surfaced to the app as `session.services.changes` (see UI Data Loading).

```ts
export type ProductDatabase = ProductQuerier & {
  writeTransaction<T>(run: (tx: ProductQuerier) => Promise<T>): Promise<T>;
};
```

The session controller opens the PowerSync database once and injects the `ProductDatabase` seam into the List and Item services. Because PowerSync's local tables are views (a write reports `rowsAffected: 0`), services confirm inserts with an app-generated `id` read-back rather than relying on `RETURNING` / `ON CONFLICT`.

## SQL Ownership

Services own SQL directly for now.

Allowed:

- app-safe List/Item services executing SQL through the `ProductDatabase` seam
- server User/Member/Household services using Drizzle/directory DB infrastructure
- the `/api/data` write applicator issuing SQL in the db layer (see ADR-0016)
- session runtime code composing app-safe services for the Authenticated App Session
- service tests injecting fake or local SQL stores

Not allowed:

- screens executing SQL
- components executing SQL
- hooks importing DB clients directly
- reusable UI importing the `ProductDatabase` seam or PowerSync
- feature code importing the server Postgres client or Clerk server SDKs directly

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

PowerSync emits an onChange signal after any local write and after synced rows arrive. The Authenticated App Session exposes that signal as `session.services.changes`; UI consumes it through `useSessionQuery` so List and Item reads re-run when the local database changes. Sync status (`session.services.sync`) is read-only connection state, not a data-reload trigger.

Current List is selection state only. Home resolves the selected `listId` from local selection state and session-scoped List services; List switching changes the selected `listId`, not a Household-owned Current List service or data source. `ActiveList` receives loaded state and explicit callbacks such as `onAddItem` and `onSetItemChecked`.

There is one local PowerSync database rather than a per-Household resource set, so there is no cached-to-fresh resource swap or stale-resource lease to manage: switching the active Household re-points the watched queries' `household_id` filter. Membership revocation is server-authoritative — PowerSync stops streaming and purges the rows for a Household the User is no longer an active Member of.

See [Authenticated App Session](./authenticated-app-session.md) for the public boundary and replacement policy.

## Offline-First Sync Semantics

PowerSync is local-first: List/Item reads and writes happen against the local PowerSync database. There is no explicit push/pull and no sync coordinator — PowerSync streams continuously while connected and queues local writes while offline.

Domain services resolve mutations on local commit:

```ts
const item = await session.services.items.addItem(input);
return item;
```

A local write lands in the PowerSync database first; PowerSync emits `session.services.changes`, and `useSessionQuery` consumers reload from local services. Separately, PowerSync's connector uploads the write to `/api/data` in the background and streams any remote changes back — when the local database changes, the same signal drives UI reloads. Services do not treat that upload as part of mutation success.

`session.services.sync` is a read-only connection-state handle: route-owned UI may call `getStatus` and `subscribe` to render the sync indicator. There is no `requestSync` and nothing to start or stop.

## Authenticated App Session

Use **Authenticated App Session** for the top-level signed-in app runtime. It identifies the active Household, active Member, current Members, resource key, and session-scoped services. Do not put Current List, List, or Item state in the session; load those through `session.services` after `session !== null`.

Preferred app-side names:

- `getSessionBootstrap`, not `bootstrapWithClerk`
- `lib/services/session/bootstrap.ts` for fresh online session loading
- `lib/services/session/controller.ts` for signed-in runtime orchestration

The session bootstrap returns directory identity only — it carries no per-Household sync tokens (the PowerSync connection token is fetched directly from Clerk). Offline startup reads the local PowerSync database; streaming resumes when the connector reconnects and re-authenticates.

## Historical Migration Note

The initial Home/List/Item migration introduced domain services over a local synced store. The current boundary supersedes the old Home-owned resource lifecycle: Authenticated App Session infrastructure exposes Household-scoped List and Item services over the PowerSync `ProductDatabase` seam, and route-owned code loads the selected List by explicit List ID.

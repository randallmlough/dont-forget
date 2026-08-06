# Services

Services are the primary entrypoint for querying and mutating product data in Don't Forget. Mobile product services live with the feature that consumes them; API services live with their server domain modules. DB infrastructure and shared contracts are separate packages. See [ADR-0011](../adr/0011-domain-first-service-layer.md), [ADR-0014](../adr/0014-db-layer-owns-data-store-infrastructure.md), [ADR-0016](../adr/0016-data-write-applicator-in-db-layer.md), [ADR-0018](../adr/0018-single-postgres-self-hosted-powersync.md), and [`docs/code-standards/architecture.md`](../code-standards/architecture.md).

## Folder Shape

Use the domain noun from `CONTEXT.md`, but place it on the correct side of the client/server boundary.

```txt
apps/mobile/src/features/item/
  item-details-sheet.tsx
  item-editor-reducer.ts
  item-inline-form.tsx
  item-row.tsx
  item-service.ts
  use-item-editor.ts
  use-item-service.ts

apps/mobile/src/features/list/
  list-items.tsx
  list-page.tsx
  list-service.ts
  use-list-collection.ts
  use-list-page.ts
  use-list-services.ts

apps/mobile/src/lib/
  product-database.ts
  sql-timestamp.ts
  use-product-query.ts

apps/mobile/src/session/
  bootstrap.ts
  provider.tsx
  session-machine.ts
  sign-out.ts
  powersync-app-database.ts
apps/mobile/src/session/powersync/
  connector.ts
  provider.tsx
  powersync.ts
  schema.ts

apps/api/src/bootstrap/
  api.ts
apps/api/src/data/
  api.ts
  authenticate.ts
  payload.ts
  rate-limit.ts
apps/api/src/households/
  household-service.ts
  member-service.ts
  api.ts
apps/api/src/invitations/
  invitation-service.ts
  api.ts
apps/api/src/users/
  user-service.ts
  api.ts

packages/db/src/sync/
  applicator.ts
  pg-transaction.ts
packages/db/src/schema/
packages/db/src/migrations/
packages/db/src/fixtures/

packages/shared/src/contracts/
```

Rules:

- Mobile List and Item services live under `apps/mobile/src/features/list/` and `apps/mobile/src/features/item/` because they are app-safe product services over local PowerSync SQLite.
- API domain modules live under `apps/api/src/<domain>/` and own their services plus the `api.ts` HTTP handler for that domain.
- `apps/api/src/data/` owns `/api/data` HTTP authentication, payload bounds, rate limiting, transaction orchestration, and response mapping.
- Data-store infrastructure lives in `packages/db/`: Drizzle schema, migrations, fixtures, seed/reset/migrate/generate scripts, test database helpers, the write applicator, and its Postgres transaction.
- Shared wire contracts and cross-boundary helpers live in `packages/shared/` and are consumed through `@dont-forget/shared` exports.

## Runtime Boundary

Workspaces cannot reach into each other's source trees. The `dont-forget/package-boundaries` ESLint rule rejects relative escapes, cross-package aliases, undeclared workspace dependencies, and unexported package subpaths. `@mobile/*` and `@api/*` are package-local aliases; cross-workspace imports use declared/exported `@dont-forget/*` entrypoints.

Client code must not import:

- `@clerk/backend`
- server Postgres clients or operator config
- server-only environment readers such as `readPostgresConfig` or `readClerkServerConfig`
- Drizzle directory DB clients
- API or DB workspace source paths that are not exposed through declared package exports

API and DB code must not import UI, React Native, or mobile-session modules. Shared types, Zod contracts, env helpers, analytics-event names, and redaction helpers belong under `packages/shared/` when more than one workspace needs them.

The Hono composition root statically registers domain handlers:

```ts
app.post("/api/data", (context) =>
  handleDataUpload(context.req.raw, deps.data),
);
```

This keeps composition mechanical while handlers and same-domain services own request and domain policy. See [API Routes](./api-routes.md) for the route layering.

## Service Style

Use factory-based dependency injection:

```ts
import { track } from "@mobile/lib/analytics";
import { logger as defaultLogger, type Logger } from "@mobile/lib/logger";

export type ItemService = {
  listItemsQuery(input: ListItemsInput): ProductQuery<Item>;
  addItem(input: AddItemInput): Promise<Item>;
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

## PowerSync Store and the ProductDatabase Seam

The app's local product data lives in one PowerSync database under `apps/mobile/src/session/powersync/`:

- `schema.ts` — the declarative `AppSchema` (client views over synced rows; there are no client migrations).
- `powersync.ts` — the `PowerSyncDatabase` singleton.
- `connector.ts` — the backend connector: it fetches the connection token from Clerk and uploads local writes to `/api/data`.
- `provider.tsx` — the React provider that makes the database available to PowerSync watched-query hooks.

Services never import PowerSync directly. They depend on the narrow `ProductDatabase` seam in `apps/mobile/src/lib/product-database.ts`, which exposes `getAll` / `getOptional` / `execute`, `writeTransaction(run)`, and `ProductQuery<T>` for watched reads. `apps/mobile/src/session/powersync-app-database.ts` adapts the PowerSync handle to this seam and exports the production `appProductDatabase` singleton.

```ts
export type ProductDatabase = ProductQuerier & {
  writeTransaction<T>(run: (tx: ProductQuerier) => Promise<T>): Promise<T>;
};

export type ProductQuery<T> = {
  execute(): Promise<T[]>;
  compile(): {
    readonly sql: string;
    readonly parameters: readonly unknown[];
  };
};
```

`useListServices({ householdId, userId })` constructs the List service and Current List selection store, while `useItemService({ householdId })` constructs the Item service. Both hooks compose their services over `appProductDatabase`. Because PowerSync's local tables are views, services confirm inserts with an app-generated `id` read-back rather than relying on `RETURNING` / `ON CONFLICT`.

## SQL Ownership

Services own SQL directly for now.

Allowed:

- client List/Item services executing SQL through the `ProductDatabase` seam
- server User/Member/Household/Invitation services using Drizzle and server DB infrastructure
- the `/api/data` write applicator in `packages/db/src/sync/` issuing write-path SQL (see ADR-0016)
- route-owned hooks composing app-safe services for signed-in UI
- service tests injecting fake or local SQL stores

Not allowed:

- screens executing SQL
- reusable UI executing SQL
- hooks importing DB clients directly instead of using feature services
- reusable UI importing the `ProductDatabase` seam or PowerSync
- feature code importing the server Postgres client or Clerk server SDKs directly

Services should return domain-shaped records, not raw SQL rows and not component types.

## UI Data Loading

Reusable components keep UI-facing contracts. They should not import domain services directly when that would couple them to Authenticated App Session, stores, or service factories. Route-owned hooks or containers adapt domain services into component props.

For signed-in UI, `apps/mobile/src/session/provider.tsx` exposes:

```ts
const { state, session, retry, reloadSession, signOut } =
  useAuthenticatedAppSession();
```

`state` is lifecycle/UI metadata only. `session` is top-level and nullable; when it is non-null, route-owned hooks create product services:

```ts
const listServices = useListServices({
  householdId: session.activeHousehold.id,
  userId: session.activeMember.userId,
});
const itemService = useItemService({
  householdId: session.activeHousehold.id,
});
const items = useProductQuery(
  itemService.listItemsQuery({ listId }),
);
```

PowerSync watched queries re-run when their dependent local rows change. UI consumes them through `useProductQuery`, which wraps `@powersync/react`'s `useQuery` and returns `{ data, isLoading, isFetching, error }`. Sync status comes from `useSyncState()` and is read-only connection state, not a data-reload trigger.

Current List is selection state only. `useListCollection(session)` owns active List summaries, Current List resolution/selection, and List CRUD policy, allowing the route-owned native navigation surface to use the Current List name. The screen-owned `HomeListPager` coordinates focused presentation and composes one feature-owned `ListPage` per mounted List; each `ListPage` watches its explicit List's Items through `useListPage`. List switching changes the selected `listId`, not a Household-owned Current List service or data source. `ListPage` owns `useItemEditor` and passes its Item actions and watched-query results to `ListItems`. That List-owned composition renders the Item-owned `ItemRow`, `ItemInlineForm`, and details and List-selector sheets.

There is one local PowerSync database rather than a per-Household resource set, so there is no cached-to-fresh resource swap or stale-resource lease to manage: switching the active Household re-points watched queries' `household_id` filters. Membership revocation is server-authoritative — PowerSync stops streaming and purges the rows for a Household the User is no longer an active Member of.

See [Authenticated App Session](./authenticated-app-session.md) for the public boundary and replacement policy.

## Offline-First Sync Semantics

PowerSync is local-first: List/Item reads and writes happen against the local PowerSync database. There is no explicit push/pull and no sync coordinator — PowerSync streams continuously while connected and queues local writes while offline.

Domain services resolve mutations on local commit:

```ts
const item = await services.items.addItem(input);
return item;
```

A local write lands in the PowerSync database first; PowerSync watched-query consumers reload when the local database changes. Separately, PowerSync's connector uploads the write to `/api/data` in the background and streams any remote changes back. Services do not treat that upload as part of mutation success.

`useSyncState()` is a read-only connection-state hook for the sync indicator. There is no `requestSync` and nothing for route-owned UI to start or stop.

## Authenticated App Session

Use **Authenticated App Session** for the top-level signed-in app runtime. It identifies the active Household, active Member, current Members, and available Households. Do not put Current List, List, or Item state in the session; load product data through feature services after `session !== null`.

Preferred app-side names:

- `createSessionBootstrapService().getSession`, not `bootstrapWithClerk`
- `apps/mobile/src/session/bootstrap.ts` for fresh online session loading
- `apps/mobile/src/session/provider.tsx` and `apps/mobile/src/session/session-machine.ts` for signed-in runtime orchestration

The session bootstrap returns directory identity only — it carries no per-Household sync tokens (the PowerSync connection token is fetched directly from Clerk). Offline startup reads the local PowerSync database; streaming resumes when the connector reconnects and re-authenticates.

## Historical Migration Note

The initial Home/List/Item migration introduced domain services over a local synced store. The current boundary supersedes the old Home-owned resource lifecycle: route-owned hooks compose Household-scoped List and Item services over the PowerSync `ProductDatabase` seam, and Home loads the selected List by explicit List ID.

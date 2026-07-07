# Services

Services are the primary entrypoint for querying and mutating product data in Don't Forget. Client product services live with the feature that consumes them; server services live with their server domain modules. See [ADR-0011](../adr/0011-domain-first-service-layer.md), [ADR-0014](../adr/0014-db-layer-owns-data-store-infrastructure.md), [ADR-0016](../adr/0016-powersync-write-path.md), [ADR-0018](../adr/0018-current-list-selection-boundary.md), and [`docs/code-standards/architecture.md`](../code-standards/architecture.md).

## Folder Shape

Use the domain noun from `CONTEXT.md`, but place it on the correct side of the client/server boundary.

```txt
src/client/features/list/
  item-service.ts
  list-service.ts
  use-product-services.ts
  use-powersync-query.ts

src/client/lib/
  product-database.ts

src/client/session/
  bootstrap.ts
  provider.tsx
  session-machine.ts
  sign-out.ts
  powersync-app-database.ts
src/client/session/powersync/
  connector.ts
  provider.tsx
  powersync.ts
  schema.ts

src/server/bootstrap/
  api.ts
src/server/data/
  api.ts
src/server/households/
  household-service.ts
  member-service.ts
  api.ts
src/server/invitations/
  invitation-service.ts
  api.ts
src/server/sync/
  applicator.ts
  authenticate.ts
  payload.ts
  rate-limit.ts
src/server/users/
  user-service.ts
  api.ts
src/server/db/
src/server/db/schema/
src/server/db/migrations/
src/server/db/fixtures/
```

Rules:

- Client List and Item services live under `src/client/features/list/` because they are app-safe product services over local PowerSync SQLite.
- Server domain modules live under `src/server/<domain>/` and own their services plus the `api.ts` handler for that domain.
- `src/server/sync/` owns the `/api/data` applicator, authentication, payload validation, rate limiting, and transaction helpers.
- Data-store infrastructure lives in `src/server/db/`: Drizzle schema, migrations, fixtures, seed/reset/migrate/generate scripts, and test database helpers.
- Shared wire contracts and cross-boundary helpers live in `src/shared/`.

## Runtime Boundary

Client and server code cannot freely import each other. The `no-client-server-imports` ESLint rule in `tooling/eslint-plugin/` blocks client-to-server imports: it runs over `src/client` and non-API `src/app` files and forbids `@/server/*`. Server-to-client imports are prohibited by standards and review convention.

Client code must not import:

- `@clerk/backend`
- server Postgres clients or operator config
- server-only environment readers such as `readPostgresConfig` or `readClerkServerConfig`
- Drizzle directory DB clients
- anything under `src/server/`

Server code must not import UI, React Native, or client-session modules. Shared types, Zod contracts, env helpers, analytics-event names, and redaction helpers belong under `src/shared/` when both sides need them.

Expo API Routes keep server imports lazy inside request handlers and delegate to domain handlers:

```ts
export async function POST(request: Request): Promise<Response> {
  const { handleDataUpload } = await import("@/server/data/api");
  return handleDataUpload(request);
}
```

This keeps route files thin and preserves native bundle safety. See [API Routes](./api-routes.md) for the route layering.

## Service Style

Use factory-based dependency injection:

```ts
import { track } from "@/client/lib/analytics";
import { logger as defaultLogger, type Logger } from "@/client/lib/logger";

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

The app's local product data lives in one PowerSync database under `src/client/session/powersync/`:

- `schema.ts` — the declarative `AppSchema` (client views over synced rows; there are no client migrations).
- `powersync.ts` — the `PowerSyncDatabase` singleton.
- `connector.ts` — the backend connector: it fetches the connection token from Clerk and uploads local writes to `/api/data`.
- `provider.tsx` — the React provider that makes the database available to PowerSync watched-query hooks.

Services never import PowerSync directly. They depend on the narrow `ProductDatabase` seam in `src/client/lib/product-database.ts`, which exposes `getAll` / `getOptional` / `execute`, `writeTransaction(run)`, and `ProductQuery<T>` for watched reads. `src/client/session/powersync-app-database.ts` adapts the PowerSync handle to this seam and exports the production `appProductDatabase` singleton.

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

`useProductServices({ householdId, userId })` constructs List and Item services over `appProductDatabase`. Because PowerSync's local tables are views, services confirm inserts with an app-generated `id` read-back rather than relying on `RETURNING` / `ON CONFLICT`.

## SQL Ownership

Services own SQL directly for now.

Allowed:

- client List/Item services executing SQL through the `ProductDatabase` seam
- server User/Member/Household/Invitation services using Drizzle and server DB infrastructure
- the `/api/data` write applicator in `src/server/sync/` issuing write-path SQL (see ADR-0016)
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

For signed-in UI, `src/client/session/provider.tsx` exposes:

```ts
const { state, session, retry, reloadSession, signOut } =
  useAuthenticatedAppSession();
```

`state` is lifecycle/UI metadata only. `session` is top-level and nullable; when it is non-null, route-owned hooks create product services:

```ts
const services = useProductServices({
  householdId: session.activeHousehold.id,
  userId: session.activeMember.userId,
});
const items = usePowerSyncQuery(
  services.items.listItemsQuery({ listId }),
);
```

PowerSync watched queries re-run when their dependent local rows change. UI consumes them through `usePowerSyncQuery`, which wraps `@powersync/react`'s `useQuery` and returns `{ data, isLoading, isFetching, error }`. Sync status comes from `useSyncState()` and is read-only connection state, not a data-reload trigger.

Current List is selection state only. Production Home renders `<CurrentList session={session} />`; `CurrentList` props are `{ session, deps? }` and it resolves the Current List itself with `useHomeCurrentList(session)`. List switching changes the selected `listId`, not a Household-owned Current List service or data source. `onAddItem` / `onSetItemChecked`-style callback props live on internal children such as `ListHeader`, `ItemRows`, and `AddItemForm`, not on `CurrentList`.

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
- `src/client/session/bootstrap.ts` for fresh online session loading
- `src/client/session/provider.tsx` and `src/client/session/session-machine.ts` for signed-in runtime orchestration

The session bootstrap returns directory identity only — it carries no per-Household sync tokens (the PowerSync connection token is fetched directly from Clerk). Offline startup reads the local PowerSync database; streaming resumes when the connector reconnects and re-authenticates.

## Historical Migration Note

The initial Home/List/Item migration introduced domain services over a local synced store. The current boundary supersedes the old Home-owned resource lifecycle: route-owned hooks compose Household-scoped List and Item services over the PowerSync `ProductDatabase` seam, and Home loads the selected List by explicit List ID.

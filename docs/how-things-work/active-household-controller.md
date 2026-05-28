# Active Household Controller

The Active Household controller owns the signed-in active Household resource graph. It is activated through the Active Household provider at the authenticated route-group boundary.

Home currently renders the active Household's Current List, but Home is a consumer. It does not open, replace, sync, close, or delete Household DB resources directly.

## Public Boundary

- `ActiveHouseholdProvider`: mounted from `app/(app)/_layout.tsx` around signed-in routes.
- `useActiveHousehold()`: gives screens the current content state, current Member display name, retry action, and sign-out action.
- `createActiveHouseholdController(...)`: constructs the controller for tests and provider-owned app use.

## Snapshot Model

The controller publishes these snapshots:

- `idle`: no active Household resource is published.
- `loading`: activation or replacement is in progress; may include a previous view during safe cached-to-fresh replacement.
- `ready`: a borrowed Active Household view is available.
- `error`: activation failed. A previous view is kept only when it is still safe to render.

The provider maps `ready` snapshots, and `loading` snapshots with a previous view, to reusable Active Household content for screens. That content contains the borrowed Current List data source, but it does not contain preloaded List or Item state.

## Resource Ownership

The controller owns Household Session loading and composes the signed-in Household dependencies in one place: HouseholdStore access, List and Item services behind the Current List data source, and the sync coordinator. Activation publishes those app-shell resources without loading the Current List, Lists, or Items. Consumers borrow handles and never close data sources, stop coordinators, or delete Household DB files directly.

Reusable Current List UI receives an `ActiveListDataSource` and sync coordinator from the provider-owned active Household view. Home calls `dataSource.load()` after the active Household view exists, then passes the loaded state to `ActiveList.Provider`. Active List may request `localWrite` or `manualRefresh` sync through the coordinator, but it does not call HouseholdStore or native sync APIs directly.

## Replacement Policy

Safe cached-to-fresh replacement keeps cached Current List UI writable while fresh authorized resources are prepared. When the replacement view is published, the old borrowed resource rejects new calls with a typed stale-resource error and closes only after accepted operations drain.

Unauthorized cached invalidation is stricter. If a fresh Household Session proves the cached Household is unauthorized, the controller retires cached resources before deleting local data and does not keep stale Household data visible.

## Sync Ownership

The Active Household controller owns when a sync coordinator exists, starts, stops, and is replaced. The coordinator owns reason-to-mode policy for one controller-owned Current List resource set:

- `localWrite` and `retry` use push-local sync.
- `manualRefresh`, `appForeground`, and `networkReconnect` use full sync.

See [Sync Coordinator](./sync-coordinator.md) for retry, foreground, reconnect, offline, and failure policy.

## Sign-Out

The provider sign-out action runs in this order:

1. Track `user_signed_out`.
2. Reset analytics.
3. Dispose the Active Household controller.
4. Delete cached Household local DB data when cached metadata exists.
5. Clear cached Household Session metadata.
6. Call Clerk `signOut()`.

Controller disposal and local cleanup failures are logged but do not block Clerk sign-out. Duplicate sign-out presses are ignored while the first sign-out is in flight.

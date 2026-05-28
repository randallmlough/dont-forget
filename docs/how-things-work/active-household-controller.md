# Active Household Controller

The Active Household controller owns the signed-in active Household resource graph. It is activated through the Active Household provider at the authenticated route-group boundary.

Home currently renders the active Household's selected Current List, but Home is a consumer. It does not open, replace, sync, close, or delete Household DB resources directly. Current List is selection state only; it is not a Household-owned service or resource boundary.

## Snapshot model

Controller snapshots are intentionally Household-shell-shaped:

- `idle`: no signed-in active Household resources are available.
- `loading`: the controller is preparing cached or fresh Household resources. It may include a previous borrowed active Household view during safe replacement.
- `error`: active Household preparation failed, optionally with a previous borrowed view.
- `ready`: a borrowed active Household view is available.

The provider maps `ready` snapshots, and `loading` snapshots with a previous view, to reusable Active Household content for screens. That content contains the active Household, active Member, Members, List and Item services, a sync coordinator, and an opaque active Household resource key. It does not contain preloaded List or Item state.

## Boundary

The controller owns Household Session loading and composes the signed-in Household dependencies in one place: HouseholdStore access, List and Item services, sync fallback, and the sync coordinator. Activation publishes those app-shell resources without loading the Current List, Lists, or Items. Consumers borrow handles and never close services, stop coordinators, or delete Household DB files directly.

Route-owned loading code chooses a List ID and calls services explicitly. Home uses `DEFAULT_LIST_ID` for now, then calls `getList({ listId })`, `listItems({ listId })`, `addItem({ listId, ... })`, and `setItemChecked({ listId, ... })` only after active Household content exists. `ActiveList` receives loaded state and explicit callbacks; it does not receive a Current List data source.

## Replacement and stale resources

Safe cached-to-fresh replacement keeps cached List UI writable while fresh authorized active Household resources are prepared. When the replacement view is published, the old borrowed resource rejects new List/Item/sync calls with a typed stale-resource error and closes only after accepted operations drain.

Unauthorized cached invalidation is stricter. If a fresh Household Session proves the cached Household is unauthorized, the controller retires cached resources before deleting local data and does not keep stale Household data visible.

## Sync ownership

The Active Household controller owns when a sync coordinator exists, starts, stops, and is replaced. The coordinator owns reason-to-mode policy for one controller-owned active Household resource set:

- cached/offline resources are not authorized for remote sync and publish offline coordinator state;
- fresh authorized resources start the coordinator after publication;
- local List and Item writes request coordinator sync through `localWrite` after the local service write succeeds;
- manual refresh requests coordinator sync through `manualRefresh`, then reloads the explicit List ID.

## Sign-out cleanup

The Active Household provider owns sign-out order:

1. Track `user_signed_out`.
2. Reset analytics identity.
3. Dispose the Active Household controller.
4. Delete local Household DB files for disposed Household IDs.
5. Clear cached Household Session metadata.
6. Call Clerk `signOut()`.

If Clerk sign-out fails after local cleanup, the provider attempts to reactivate the controller with the latest auth inputs so the app can recover a valid signed-in Household view.

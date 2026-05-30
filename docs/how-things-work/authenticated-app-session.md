# Authenticated App Session

The Authenticated App Session controller owns the signed-in app resource graph. It is activated through `AuthenticatedAppSessionProvider` at the authenticated route-group boundary.

Home currently renders the session's selected Current List, but Home is a consumer. It does not open, replace, sync, close, or delete Household DB resources directly. Current List is selection state only; it is not a Household-owned service or resource boundary.

## Public Provider Boundary

Screens consume the public hook:

```ts
const { state, session, retry, reloadSession, signOut } =
  useAuthenticatedAppSession();
```

Public state is lifecycle/UI metadata only:

```ts
type AuthenticatedAppSessionState =
  | { status: "loading" }
  | { status: "ready"; refreshing: boolean }
  | { status: "error"; message: string };
```

`session` is top-level and nullable. `session !== null` means route-owned hooks may use session-scoped services:

```ts
await session.services.lists.getList({ listId });
await session.services.items.listItems({ listId });
await session.services.sync.requestSync({ reason: "manualRefresh" });
```

`session.households` lists every active Household associated with the signed-in User. Each entry includes `id`, `name`, the User's Member `role`, and `isActive`. `session.activeHousehold` remains the one Household whose resources back `session.services`.

`session.services.sync` is a consumer-safe sync handle. It exposes status, subscription, and reasoned sync requests, but not coordinator lifecycle methods.

There is no public `view` property and no nested `state.session`.

## Controller Snapshot Model

Controller snapshots are internal and resource-lifecycle oriented:

- `idle`: no signed-in session resources are available.
- `loading`: the controller is preparing cached or fresh Household resources. It may include a previous `session` during safe replacement.
- `error`: session preparation failed, optionally with a previous `session` for internal recovery policy.
- `ready`: an `AuthenticatedAppSession` is available.

The provider maps `ready` snapshots, and `loading` snapshots with a previous session, to public `state: { status: "ready", refreshing }` plus top-level `session`. It maps loading without a previous session to `state: { status: "loading" }` and `session: null`.

## Boundary

The controller owns Authenticated App Session loading and composes the signed-in Household dependencies in one place: `HouseholdStore` access, List and Item services, native sync access, and the sync coordinator. Activation publishes those app-shell resources without loading the Current List, Lists, or Items. Consumers borrow handles and never close services, stop coordinators, or delete Household DB files directly.

Route-owned loading code chooses a List ID and calls services explicitly. Home uses `DEFAULT_LIST_ID` for now, then calls `getList({ listId })`, `listItems({ listId })`, `addItem({ listId, ... })`, and `setItemChecked({ listId, ... })` only after `session` exists. `ActiveList` receives loaded state and explicit callbacks; it does not receive a Current List data source.

After accept, join, or switch mutations update directory state, screens call the provider-owned `reloadSession()` action. Screens do not call bootstrap directly and do not open, close, replace, or delete Household resources.

## Replacement and Stale Resources

Safe cached-to-fresh replacement keeps cached List UI writable while fresh authorized session resources are prepared. When the replacement session is published, the old borrowed resource rejects new List/Item/sync calls with a typed stale-resource error and closes only after accepted operations drain.

Unauthorized cached invalidation is stricter. If a fresh Authenticated App Session proves the cached Household is no longer associated with the User, the controller retires cached resources before deleting local data and does not keep stale Household data visible. A Household switch to another associated Household is not unauthorized; it uses normal replacement, while the previous Household remains available in `session.households`.

## Sync Ownership

The Authenticated App Session controller owns when a sync coordinator exists, starts, stops, and is replaced. The coordinator owns reason-to-mode policy for one controller-owned session resource set:

- cached/offline resources are not authorized for remote sync and publish offline coordinator state;
- fresh authorized resources start the coordinator after publication;
- local List and Item writes request coordinator sync through `localWrite` after the local service write succeeds;
- manual refresh requests coordinator sync through `manualRefresh`, then reloads the explicit List ID.

Only the controller can start or stop the underlying coordinator. Screens and route-owned hooks receive the narrowed `session.services.sync` handle and must not manage sync lifecycle.

## Sign-out Cleanup

The Authenticated App Session sign-out module owns sign-out order. The provider adapts Clerk auth and exposes the session-owned action:

1. Track `user_signed_out`.
2. Reset analytics identity.
3. Dispose the Authenticated App Session controller.
4. Clear signed-out session data for the disposed Household IDs, including cached metadata and local Household DB files.
5. Call Clerk `signOut()`.

If Clerk sign-out fails after local cleanup, the sign-out module attempts to reactivate the controller with the latest auth inputs so the app can recover a valid signed-in session.

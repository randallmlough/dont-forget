# Authenticated App Session

The Authenticated App Session controller owns the signed-in app resource graph. It is activated through `AuthenticatedAppSessionProvider` at the authenticated route-group boundary.

Home currently renders the session's selected Current List, but Home is a consumer. It does not manage the PowerSync connection or session resources directly. Current List is selection state only; it is not a Household-owned service or resource boundary.

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
const status = session.services.sync.getStatus();
```

`session.households` lists every active Household associated with the signed-in User. Each entry includes `id`, `name`, the User's Member `role`, and `isActive`. `session.activeHousehold` remains the one Household whose resources back `session.services`.

`session.services.sync` is a read-only PowerSync sync-status handle. It exposes `getStatus` and `subscribe`; there is no `requestSync` and no coordinator lifecycle. `session.services.changes` is the companion onChange notifier that `useSessionQuery` subscribes to for reactive reads.

There is no public `view` property and no nested `state.session`.

## Controller Snapshot Model

Controller snapshots are internal and resource-lifecycle oriented:

- `idle`: no signed-in session is available.
- `loading`: the controller is preparing the session and connecting PowerSync. It may include a previous `session` while reloading after a directory change (accept/join/switch).
- `error`: session preparation failed, optionally with a previous `session` for internal recovery policy.
- `ready`: an `AuthenticatedAppSession` is available.

The provider maps `ready` snapshots, and `loading` snapshots with a previous session, to public `state: { status: "ready", refreshing }` plus top-level `session`. It maps loading without a previous session to `state: { status: "loading" }` and `session: null`.

## Boundary

The controller owns Authenticated App Session loading and composes the signed-in dependencies in one place: the PowerSync `ProductDatabase` seam, List and Item services, and the read-only sync-status seam. Activation publishes those app-shell resources without loading the Current List, Lists, or Items. Consumers borrow handles and never manage the PowerSync connection or delete local data directly.

Route-owned loading code resolves a List ID and calls services explicitly. Home resolves the Current List with `resolveCurrentList` over a watched Lists query, then calls `getList({ listId })`, `listItems({ listId })`, `addItem({ listId, ... })`, and `setItemChecked({ listId, ... })` only after `session` exists. `ActiveList` receives loaded state and explicit callbacks; it does not receive a Current List data source.

After accept, join, or switch mutations update directory state, screens call the provider-owned `reloadSession()` action. Screens do not call bootstrap directly and do not manage the PowerSync connection or session resources.

## Switching and Revocation

There is one local PowerSync database holding every Household the User is an active Member of, so there is no per-Household resource set to lease, replace, or close. Switching to another associated Household re-points the watched queries' `household_id` filter after `reloadSession()`; the previous Household stays available in `session.households`.

Revocation is server-authoritative. When a fresh session (or a live sync-rule re-evaluation) shows the User is no longer an active Member of a Household, PowerSync stops streaming and purges that Household's rows from local SQLite. There is no cached-Household invalidation path for the controller to run and no local per-Household database file to delete.

## Sync

PowerSync streams continuously; there is no sync coordinator to start, stop, or replace. The controller connects the PowerSync database with the session's connector on activation and disconnects it on sign-out.

- Local List and Item writes land in the local database immediately; PowerSync's connector uploads them to `/api/data` in the background and streams remote changes back.
- `session.services.changes` fires on any local-database change and drives `useSessionQuery` reloads.
- `session.services.sync` is read-only connection state (`getStatus`/`subscribe`) for the sync indicator.

Screens and route-owned hooks receive the read-only `session.services.sync` handle and cannot manage the connection.

## Sign-out Cleanup

The Authenticated App Session sign-out module owns sign-out order. The provider adapts Clerk auth and exposes the session-owned action:

1. Track `user_signed_out`.
2. Reset analytics identity.
3. Dispose the Authenticated App Session controller.
4. Clear local synced data via PowerSync `disconnectAndClear`.
5. Call Clerk `signOut()`.

If Clerk sign-out fails after local cleanup, the sign-out module attempts to reactivate the controller with the latest auth inputs so the app can recover a valid signed-in session.

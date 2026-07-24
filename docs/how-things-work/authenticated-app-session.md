# Authenticated App Session

The Authenticated App Session provider owns the signed-in app lifecycle. It is activated through `AuthenticatedAppSessionProvider` at the authenticated route-group boundary.

Home currently renders the selected Current List, but Home is a consumer. It does not manage the PowerSync connection or session resources directly. Current List is selection state only; it is not a Household-owned service or resource boundary.

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

`session` is top-level and nullable. It is the parsed `/api/bootstrap` payload: `user`, `activeHousehold`, `activeMember`, `members`, and `households`. `session.households` lists every active Household associated with the signed-in User. Each entry includes `id`, `name`, the User's Member `role`, and `isActive`.

Route-owned hooks create product services after `session !== null`:

```ts
const services = useProductServices({
  householdId: session.activeHousehold.id,
  userId: session.activeMember.userId,
});
const syncStatus = useSyncState();
```

`useProductServices` lives in `src/client/features/list/use-product-services.ts` and constructs List and Item services over `appProductDatabase`, the plain `ProductDatabase` singleton in `src/client/session/powersync-app-database.ts`. Reactive reads use `ProductQuery<T>` values from those services with `usePowerSyncQuery` in `src/client/features/list/use-powersync-query.ts`, a thin wrapper over PowerSync watched queries.

There is no public `view` property and no nested `state.session`.

## Session Machine

`src/client/session/session-machine.ts` owns the pure state transitions. `reduceSessionMachine` consumes auth, reload, sign-out, and activation events and returns the next state plus effects. The provider in `src/client/session/provider.tsx` runs those effects.

Effects are limited to:

- `activate`: fetch bootstrap, connect PowerSync with `db.connect(new PowerSyncConnector(...))`, then publish the session.
- `markSessionHint`: record that a signed-in app session exists.
- `disconnectAndClear`: clear stale local PowerSync state when an activation loses a race to sign-out or auth changes.

The machine uses an attempt counter as its cancellation token. A stale activation result cannot publish an older session over a newer request. Reloads that still have a previous session render as `state: { status: "ready", refreshing: true }` plus the existing top-level `session`; reloads without one render loading with `session: null`.

## Boundary

The provider owns Authenticated App Session loading and composes the signed-in lifecycle in one place: bootstrap, PowerSync connection, session hinting, and sign-out. Activation publishes directory identity without loading the Current List, Lists, or Items. Consumers never manage the PowerSync connection or delete local data directly.

The Home screen resolves the Current List with `useHomeCurrentList(session)` from `src/client/features/list/use-home-current-list.ts`, then passes that state to `CurrentList`. This lets the route-owned screen configure its native stack title from the Current List while `CurrentList` remains responsible for the List surface. The hook composes `useProductServices` with PowerSync watched queries through `usePowerSyncQuery`, derives the selected Current List for the active Household, and exposes actions. `onAddItem` / `onSetItemChecked`-style callback props live on internal children such as `ListOverview`, `ItemRows`, and `AddItemForm`, not on `CurrentList`.

After accept, join, or switch mutations update directory state, screens call the provider-owned `reloadSession()` action. Screens do not call bootstrap directly and do not manage the PowerSync connection or session resources.

## Switching and Revocation

There is one local PowerSync database holding every Household the User is an active Member of, so there is no per-Household resource set to lease, replace, or close. Switching to another associated Household re-points watched queries' `household_id` filters after `reloadSession()`; the previous Household stays available in `session.households`.

Revocation is server-authoritative. When a fresh session or live sync-rule re-evaluation shows the User is no longer an active Member of a Household, PowerSync stops streaming and purges that Household's rows from local SQLite. There is no cached-Household invalidation path to run and no local per-Household database file to delete.

## Sync

PowerSync streams continuously; there is no sync coordinator to start, stop, or replace. The provider connects the PowerSync database with the session connector on activation and disconnects it on sign-out.

- `PowerSyncProvider` in `src/client/session/powersync/provider.tsx` exposes the raw PowerSync `db` singleton through `PowerSyncContext.Provider`.
- Local List and Item writes land in the local database immediately; PowerSync's connector uploads them to `/api/data` in the background and streams remote changes back.
- Reactive reads use `usePowerSyncQuery(query)`, where `query` is a service-owned `ProductQuery<T>`.
- Sync status comes from `useSyncState()`, which maps PowerSync connection state to `"synced" | "pending" | "offline" | "failed"`.

Screens and route-owned hooks can read sync status, but they cannot manage the connection.

## Sign-out Cleanup

The Authenticated App Session sign-out module owns sign-out order. The provider adapts Clerk auth and exposes the session-owned action:

1. Track `user_signed_out`.
2. Reset analytics identity.
3. Best-effort PowerSync `disconnectAndClear()`; failures are logged and do not abort.
4. Best-effort session hint clear; failures are logged and do not abort.
5. Best-effort Current List selection clear for the signed-out User; failures are logged and do not abort.
6. Clerk `signOut()`; this is the critical step and its failure propagates.

If Clerk sign-out fails after local cleanup, the provider dispatches `signOutFailed`. While auth still reports signed-in, the machine restarts activation so the app can recover a valid signed-in session.

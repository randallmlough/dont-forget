# Authenticated App Session

The Authenticated App Session provider owns the signed-in app lifecycle. It is activated through `AuthenticatedAppSessionProvider` at the authenticated route-group boundary.

Home currently renders the selected Current List, but Home is a consumer. It does not manage the PowerSync connection or session resources directly. Current List is selection state only; it is not a Household-owned service or resource boundary.

## Public Provider Boundary

Screens consume the public hook:

```ts
const {
  state,
  session,
  localData,
  retry,
  reloadSession,
  signOut,
  signInAsPreviousUser,
  removePreviousUserDataAndContinue,
} = useAuthenticatedAppSession();
```

Public state is lifecycle/UI metadata only:

```ts
type AuthenticatedAppSessionState =
  | { status: "loading" }
  | { status: "ready"; refreshing: boolean }
  | { status: "error"; message: string };
```

`localData` is either ready or a different-User block:

```ts
type LocalDataState =
  | { status: "ready" }
  | { status: "differentUserBlocked"; phase: "idle" }
  | { status: "differentUserBlocked"; phase: "removing" }
  | {
      status: "differentUserBlocked";
      phase: "failed";
      errorMessage: string;
    };
```

The recovery actions sign out only the authenticated incoming Clerk User, or
run confirmed local-data removal and retry activation. Database owner and
incoming internal User IDs remain private to the provider.

`session` is top-level and nullable. It is the parsed `/api/bootstrap` payload: `user`, `activeHousehold`, `activeMember`, `members`, and `households`. `session.households` lists every active Household associated with the signed-in User. Each entry includes `id`, `name`, the User's Member `role`, and `isActive`.

Route-owned hooks create product services after `session !== null`:

```ts
const listServices = useListServices({
  householdId: session.activeHousehold.id,
  userId: session.activeMember.userId,
});
const itemService = useItemService({
  householdId: session.activeHousehold.id,
});
const syncStatus = useSyncState();
```

`useListServices` lives in `apps/mobile/src/features/list/use-list-services.ts` and constructs the List service plus Current List selection store. `useItemService` lives in `apps/mobile/src/features/item/use-item-service.ts` and constructs the Item service. Both service hooks use `appProductDatabase`, the plain `ProductDatabase` singleton in `apps/mobile/src/session/powersync-app-database.ts`. Reactive reads use `ProductQuery<T>` values from those services with `useProductQuery` in `apps/mobile/src/lib/use-product-query.ts`, a thin wrapper over PowerSync watched queries.

There is no public `view` property and no nested `state.session`.

## Session Machine

`apps/mobile/src/session/session-machine.ts` owns the pure state transitions. `reduceSessionMachine` consumes auth, reload, sign-out, and activation events and returns the next state plus effects. The provider in `apps/mobile/src/session/provider.tsx` runs those effects.

Effects are limited to:

- `activate`: fetch bootstrap, prepare durable internal-User database ownership, connect PowerSync with `db.connect(new PowerSyncConnector(...))`, then publish the session.
- `markSessionHint`: record that a signed-in app session exists.
- `disconnect`: stop sync without clearing local rows or queued writes when auth is lost, a User changes, or an activation loses a race.

The machine uses an attempt counter as its cancellation token. A stale activation result cannot publish an older session over a newer request. Reloads that still have a previous session render as `state: { status: "ready", refreshing: true }` plus the existing top-level `session`; reloads without one render loading with `session: null`.

## Boundary

The provider owns Authenticated App Session loading and composes the signed-in lifecycle in one place: bootstrap, durable database ownership preparation, PowerSync connection, session hinting, and sign-out. Activation publishes directory identity without loading the Current List, Lists, or Items. Consumers never manage the PowerSync connection or delete local data directly.

`database-ownership.ts` owns the durable marker and rollout inference. On an
install without a marker, it can infer exactly one local internal User, use the
validated persisted session only when the local Users table is empty, or claim
a genuinely empty database for the incoming User. Multiple or contradictory
Users fail closed. After the marker exists, it is the only ownership source.

Every bootstrap, persisted restore, and signed-in fallback prepares ownership
before connect. Matching ownership can connect. A mismatch while an incoming
Clerk User is authenticated publishes the blocked Home state. A signed-out
mismatch refuses restore through the existing failure/sign-in path and never
offers destructive recovery.

The Home screen calls `useListCollection(session)` once. The collection owns List summaries, Current List resolution and selection, and List CRUD policy; the screen passes its single state to the screen-owned `HomeListPager`. Each feature-owned `ListPage` watches its explicit List's Items through `useListPage`, so one List's failed Items query cannot gate the pager. Item actions and watched-query results remain behind `ListPage`, which owns `useItemEditor` and passes the resulting editor and Items to `ListItems`. `ListItems` composes the Item-owned `ItemRow`, `ItemInlineForm`, and details and List-selector sheets.

After accept, join, or switch mutations update directory state, screens call the provider-owned `reloadSession()` action. Screens do not call bootstrap directly and do not manage the PowerSync connection or session resources.

## Switching and Revocation

There is one local PowerSync database holding every Household the User is an active Member of, so there is no per-Household resource set to lease, replace, or close. Switching to another associated Household re-points watched queries' `household_id` filters after `reloadSession()`; the previous Household stays available in `session.households`.

Revocation is server-authoritative. When a fresh session or live sync-rule re-evaluation shows the User is no longer an active Member of a Household, PowerSync stops streaming and purges that Household's rows from local SQLite. There is no cached-Household invalidation path to run and no local per-Household database file to delete.

User identity transitions are different from Household switching. Same-User
reauthentication retains the database and reconnects. A direct signed-in
User-A-to-User-B transition retires A, disconnects without clearing, bootstraps
B, and blocks B before connect when durable ownership still belongs to A. The
blocked Home state mounts before all product-query hooks.

## Sync

PowerSync streams continuously; there is no sync coordinator to start, stop, or replace. The provider connects the PowerSync database with the session connector only after ownership preparation and disconnects it on auth transitions without clearing retained data.

- `PowerSyncProvider` in `apps/mobile/src/session/powersync/provider.tsx` exposes the raw PowerSync `db` singleton through `PowerSyncContext.Provider`.
- Local List and Item writes land in the local database immediately; PowerSync's connector uploads them to `/api/data` in the background and streams remote changes back.
- Reactive reads use `useProductQuery(query)`, where `query` is a service-owned `ProductQuery<T>`.
- Sync status comes from `useSyncState()`, which maps PowerSync connection state to `"synced" | "pending" | "offline" | "failed"`.

Screens and route-owned hooks can read sync status, but they cannot manage the connection.

## Sign-out Cleanup

The Authenticated App Session sign-out module owns sign-out order. The provider adapts Clerk auth and exposes the session-owned action:

1. Capture the outgoing internal User ID.
2. Clear the persisted Authenticated App Session; this is critical.
3. Call Clerk `signOut()`; this is critical.
4. Best-effort PowerSync `disconnect()`.
5. Best-effort Current List selection clear for the outgoing User.
6. Track `user_signed_out`, then reset analytics identity.

Critical failure emits no successful Sign Out analytics. If Clerk sign-out
fails, the provider dispatches `signOutFailed`; while auth still reports signed
in, the machine restarts activation so the app can recover a valid session. If
Clerk already reports signed out when Sign Out fails, the provider still runs a
non-destructive disconnect and publishes the sign-in-required state.

Sign Out completion distinguishes Clerk's delayed auth flip from a real
reauthentication. A completion that has not observed signed out suppresses
activation until that observation arrives. If signed out was observed and a
valid signed-in User arrived while serialized cleanup was still running, the
provider resumes fresh ownership-gated activation; the same User reconnects,
while a different User reaches the normal local-data block before connect.
Normal Sign Out never calls `disconnectAndClear()` and preserves product rows,
queued writes, and the database-owner marker. Only the confirmed
different-User recovery action may clear them.

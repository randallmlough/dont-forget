# Sync Coordinator

The Sync Coordinator owns sync policy for one controller-owned authenticated app session resource set. It is the app-owned policy boundary that decides when sync work starts, which sync mode to use, how sync status changes, how failures are classified, and when retry or lifecycle work should stop. The Authenticated App Session controller owns when a coordinator exists, starts, stops, and is replaced.

The coordinator is a deep module: callers see a small interface, while the retry, serialization, status, and failure policy stays inside `lib/services/sync/sync-coordinator.ts`.

## Public Interface

Create one coordinator for each controller-owned authenticated app session resource set and pass a logger already scoped to that Household. Product callers normally use the default coordinator factory, which supplies app-wide platform lifecycle and network adapters:

```ts
const syncCoordinator = createDefaultSyncCoordinator({
	syncAuthorized: sessionDataServices.syncAuthorized,
	sync: sessionDataServices.sync,
	logger: logger.with({ household_id: session.activeHousehold.id }),
});
```

Tests and lower-level policy checks may call `createSyncCoordinator` directly with fake `appState` and `networkStatus` adapters.

The public surface is intentionally small:

- `getStatus()` returns `synced`, `pending`, `offline`, or `failed`.
- `subscribe(listener)` lets the authenticated app session controller and List UI observe coordinator-owned status changes.
- `start()` begins foreground lifecycle handling and retry cadence for the authenticated app session.
- `stop()` removes lifecycle listeners, stops retry timers, drains active sync work, and prevents stale status updates.
- `requestSync({ reason })` requests sync for an explicit reason.

The full coordinator surface is internal to controller-owned resources. `session.services.sync` exposes only `getStatus`, `subscribe`, and `requestSync` to screens and route-owned hooks so those consumers cannot start or stop lifecycle work.

## Request Reasons

The coordinator accepts these request reasons:

- `localWrite`: A local List or Item mutation committed successfully and should be pushed when authorized. The mutation already succeeded locally; sync is propagation, not part of write success. If the coordinator already knows the authenticated app session is `offline`, this automatic hint records pending local work and returns without refreshing network state or starting remote sync.
- `manualRefresh`: A Member explicitly refreshed the authenticated app session's current List and expects the app to catch up with remote Household changes as well as push local rows.
- `appForeground`: The app returned to an active state and may need to catch up for the authenticated app session.
- `networkReconnect`: The app learned the device moved from a non-online network state to a known-online network state. This is a Household catch-up request, not only a local upload request.
- `retry`: The foreground retry cadence is attempting to propagate pending local Household rows after earlier offline or recoverable failures.

Only the coordinator should decide what these reasons mean. Domain services, HouseholdStore, authenticated app session controller, and List UI should request sync by reason instead of choosing native Turso behavior directly.

## App Lifecycle

The coordinator receives foreground/background state through an app-owned adapter backed by React Native `AppState`. That adapter is an application platform input. The authenticated app session controller decides when a coordinator exists and starts; the coordinator uses app lifecycle state to decide whether foreground sync work should run.

Automatic retry and reconnect catch-up work only runs while the app is active. If the network becomes online while the app is inactive or backgrounded, the coordinator records the network state but waits for the normal foreground catch-up path before starting remote sync work.

The retry timer runs whenever the coordinator is started and the app is foreground-active, regardless of network status. It stops only on background/inactive transitions and `stop()`. Each tick self-gates: it refreshes network state and skips remote sync while the refreshed state is `offline`. Network events never stop or start the timer, so no platform event sequence can leave the cadence dead while the app is in use, and the per-tick network refresh doubles as a polling fallback for NetInfo events that never arrive.

## Network Status

The coordinator receives device connectivity through an app-owned, app-wide network adapter rather than importing a platform network package directly into UI, data-source, HouseholdStore, or domain service code.

The adapter exposes three app-level states, decided by NetInfo's `isConnected` alone:

- `online`: the device reports an active connection (`isConnected: true`).
- `offline`: the device reports no connection (`isConnected: false`).
- `unknown`: connectivity has not resolved yet or cannot be determined (`isConnected: null`).

NetInfo's `isInternetReachable` flag is deliberately ignored: its reachability probe lags or never confirms after reconnect on iOS, which previously stranded devices in `offline` with every recovery trigger re-blocked. The sync attempt itself is the authoritative reachability probe — if Turso is unreachable, the attempt fails as a classified interruption and status returns to `offline`. The adapter logs every status transition with the raw NetInfo fields for field diagnostics.

The production adapter is backed by `@react-native-community/netinfo`, but tests should use fake adapters. The adapter starts as `unknown` and updates from platform events; authenticated app session controller activation does not wait for an async connectivity fetch.

Before the coordinator starts most sync requests, it asks the adapter to refresh the current platform state and skips remote sync when the refreshed state is `offline`. The exception is a known-offline `localWrite`: because that request is only an automatic propagation hint after a local List or Item write has already succeeded, the coordinator keeps pending local work and returns without refreshing network state or probing Turso. This matters on iOS because cached connectivity can be stale in either direction; a stale `online` state can otherwise start a doomed native Turso request while the simulator or device has no internet connection.

Known-offline state pauses new automatic remote attempts and keeps or transitions coordinator status to `offline`. It does not cancel in-flight sync work. If in-flight work succeeds while the network is still known offline, offline status remains the current truth until the network becomes online again.

Known-online transitions from either `offline` or `unknown` request `networkReconnect` only while the app is active. Repeated online events while already online are no-ops. Unknown connectivity keeps the existing foreground and retry fallback behavior. `manualRefresh`, `networkReconnect`, `appForeground`, and eligible `retry` remain recovery or catch-up triggers that may refresh network state and attempt remote sync after an offline period.

## Sync Mode Selection

The coordinator maps request reasons to `SyncOptions`:

- `localWrite` and `retry` use `pushLocalOnly`.
- `manualRefresh`, `appForeground`, and `networkReconnect` use `full`.

`pushLocalOnly` runs native `push()` without native pull work. If native push fails, the failure returns through the same sync error boundary as every other sync attempt; there is no second remote writer path.

`full` is reserved for deliberate catch-up work. Manual refresh, app foreground recovery, and network reconnect run native sync so the authenticated app session can both push local rows and pull remote rows when connectivity and authorization allow it.

If a passive `retry` request arrives while there is no pending local change and the coordinator is already `synced`, the coordinator may no-op. App foreground and active-app network reconnect remain catch-up requests even when the coordinator is already `synced`, because other Members may have changed the Household while this device was backgrounded or offline. If the authenticated app session controller starts a fresh authorized coordinator after offline reopen, it starts retry lifecycle work so local rows saved while offline can be attempted again.

## Status Transitions

The coordinator owns these surface-visible status values:

- `synced`: The authenticated app session has no known pending sync work from the coordinator's perspective.
- `pending`: A sync attempt is running or a queued follow-up is expected.
- `offline`: Sync is not authorized for the current Authenticated App Session, or sync failed with an expected connectivity or interruption error.
- `failed`: An unexpected sync failure occurred and needs to stay visible.

Status changes are emitted through `subscribe`. Current-List UI consumes status for UI state; it does not classify sync failures or run retry policy itself.

## Serialization And Coalescing

One coordinator instance allows at most one active sync attempt for its Household. When more requests arrive while a sync is in flight, the coordinator keeps a single queued follow-up reason instead of preserving every trigger.

Queued reasons are coalesced by priority:

1. `manualRefresh`
2. `networkReconnect`
3. `localWrite`
4. `appForeground`
5. `retry`

This preserves the strongest needed sync mode without duplicating sync attempts. Manual refresh remains highest priority because it is an explicit Member action. Network reconnect remains ahead of local writes because it needs the `full` path to catch up with other Members' Household changes as well as propagate local rows. Local writes remain ahead of passive lifecycle requests because they represent newly committed Household rows.

## Failure Handling

Expected sync interruption errors are treated as offline behavior. They transition the coordinator to `offline` and are not logged as application failures, because local List and Item writes already committed to the local Household DB.

Known-offline `localWrite` requests short-circuit before network refresh because they are local-first propagation hints, not connectivity probes. When refreshed network status is offline for other reasons, sync requests short-circuit without calling remote sync. Manual refresh also short-circuits to offline state instead of forcing a doomed remote call. Unknown or online network states still allow recovery and catch-up attempts, and expected network failures remain classified as offline because network status can still be stale or imprecise.

Recoverable native sync interruptions are classified as expected offline-style interruptions when they match the app-owned sync interruption boundary. Unexpected sync failures are not recovered by a second writer path.

Unexpected sync failures are logged once at the coordinator boundary with safe Household sync context and transition status to `failed`. Manual refresh rethrows unexpected failures so the explicit refresh action can show failure state. Automatic local-write, retry, and foreground requests keep local data visible and let later coordinator retries attempt propagation again.

## Boundaries

HouseholdStore owns local/native Household DB access, operation serialization, and low-level `sync`/`pull` primitives. It should not own authenticated app session sync policy.

List and Item services own local domain reads and writes. They commit local Household rows and should not start remote sync as part of mutation success.

The authenticated app session controller creates authenticated app session List/Item services and the coordinator, closes Household resources, stops sync before sign-out or replacement, and starts fresh authorized sync lifecycle work after offline reopen. The authenticated app provider activates and observes the controller; route surfaces borrow provider dependencies and actions instead of owning Household DB or sync lifecycle.

Current-List UI owns visible List interaction and rendering. It subscribes to coordinator status, requests `localWrite` after successful local mutations, and requests `manualRefresh` for explicit refresh. Visible rows reload through the HouseholdStore change signal exposed as `session.services.changes`, not through sync status transitions.

Future platform awareness belongs behind coordinator-owned adapter boundaries. It should feed the coordinator another reasoned request instead of adding sync policy to UI, domain services, HouseholdStore, or native package call sites.

See [Authenticated App Session](./authenticated-app-session.md) for the controller/provider resource ownership boundary.

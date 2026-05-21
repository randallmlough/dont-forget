# Sync Coordinator

The Sync Coordinator owns app-level sync orchestration for one rendered data surface at a time. It is the app-owned policy boundary that decides when sync work starts, which sync mode to use, how sync status changes, how failures are classified, and when retry or lifecycle work should stop.

The coordinator is a deep module: callers see a small interface, while the retry, serialization, status, and failure policy stays inside `lib/services/sync/sync-coordinator.ts`.

## Public Interface

Create one coordinator for the rendered active Household and pass a logger already scoped to that Household:

```ts
const syncCoordinator = createSyncCoordinator({
	syncAuthorized: dataSource.syncAuthorized,
	sync: dataSource.sync,
	appState,
	networkStatus,
	logger: logger.with({ household_id: session.activeHousehold.id }),
});
```

The public surface is intentionally small:

- `getStatus()` returns `synced`, `pending`, `offline`, or `failed`.
- `subscribe(listener)` lets Home or Active List observe coordinator-owned status changes.
- `start()` begins foreground lifecycle handling and retry cadence for the active Household.
- `stop()` removes lifecycle listeners, stops retry timers, drains active sync work, and prevents stale status updates.
- `requestSync({ reason })` requests sync for an explicit reason.

## Request Reasons

The coordinator accepts these request reasons:

- `localWrite`: A local List or Item mutation committed successfully and should be pushed when authorized. The mutation already succeeded locally; sync is propagation, not part of write success.
- `manualRefresh`: A Member explicitly refreshed Home or Active List and expects the app to catch up with remote Household changes as well as push local rows.
- `appForeground`: The app returned to an active state and may need to catch up for the active Household.
- `networkReconnect`: The app learned the device moved from a non-online network state to a known-online network state. This is a Household catch-up request, not only a local upload request.
- `retry`: The foreground retry cadence is attempting to propagate pending local Household rows after earlier offline or recoverable failures.

Only the coordinator should decide what these reasons mean. Domain services, HouseholdStore, Home, and Active List should request sync by reason instead of choosing native Turso behavior directly.

## Network Status

The coordinator receives device connectivity through an app-owned, app-wide network adapter rather than importing a platform network package directly into UI, data-source, HouseholdStore, or domain service code.

The adapter exposes three app-level states:

- `online`: the device is connected and internet reachability is not known to be false.
- `offline`: the device is disconnected or internet reachability is known to be false.
- `unknown`: connectivity has not resolved yet or cannot be determined.

The production adapter is backed by `@react-native-community/netinfo`, but tests should use fake adapters. The adapter starts as `unknown` and updates from platform events; Home startup does not wait for an async connectivity fetch.

Known-offline state pauses new automatic remote attempts and keeps or transitions coordinator status to `offline`. It does not cancel in-flight sync work. If in-flight work succeeds while the network is still known offline, offline status remains the current truth until the network becomes online again.

Known-online transitions from either `offline` or `unknown` request `networkReconnect`. Repeated online events while already online are no-ops. Unknown connectivity keeps the existing foreground and retry fallback behavior.

## Sync Mode Selection

The coordinator maps request reasons to `SyncOptions`:

- `localWrite` and `retry` use `pushLocalOnly`.
- `manualRefresh`, `appForeground`, and `networkReconnect` use `full`.

`pushLocalOnly` runs the app-owned remote upsert fallback without native full sync. This keeps automatic local-write and retry paths from starting native pull loops while offline, while still trying to propagate locally committed Household rows.

`full` is reserved for deliberate catch-up work. Manual refresh, app foreground recovery, and network reconnect run native sync first, then the app-owned remote upsert fallback, so the active Household can both push local rows and pull remote rows when connectivity and authorization allow it.

If a passive `retry` request arrives while there is no pending local change and the coordinator is already `synced`, the coordinator may no-op. App foreground and network reconnect remain catch-up requests even when the coordinator is already `synced`, because other Members may have changed the Household while this device was backgrounded or offline. If Home starts a fresh authorized coordinator after offline reopen, it starts retry lifecycle work so local rows saved while offline can be attempted again.

## Status Transitions

The coordinator owns these Home-visible status values:

- `synced`: The active Household has no known pending sync work from the coordinator's perspective.
- `pending`: A sync attempt is running or a queued follow-up is expected.
- `offline`: Sync is not authorized for the current Household Session, or sync failed with an expected connectivity or interruption error.
- `failed`: An unexpected sync failure occurred and needs to stay visible.

Status changes are emitted through `subscribe`. Active List consumes status for UI state; it does not classify sync failures or run retry policy itself.

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

When network status is known offline, automatic sync requests short-circuit without calling remote sync. Manual refresh also short-circuits to offline state instead of forcing a doomed remote call. Unknown or online network states still allow the sync attempt, and expected network failures remain classified as offline because network status can be stale or imprecise.

Recoverable native sync failures that are repaired by the remote upsert fallback stay quiet when they are expected interruptions. If fallback recovers an unexpected native failure, the coordinator logs a warning once with the sync reason and keeps the operation successful.

Unexpected sync failures are logged once at the coordinator boundary with safe Household sync context and transition status to `failed`. Manual refresh rethrows unexpected failures so the explicit refresh action can show failure state. Automatic local-write, retry, and foreground requests keep local data visible and let later coordinator retries attempt propagation again.

## Boundaries

HouseholdStore owns local/native Household DB access, operation serialization, and low-level `sync`/`pull` primitives. It should not own active Household sync policy.

List and Item services own local domain reads and writes. They commit local Household rows and should not start remote sync as part of mutation success.

Home owns the active Household Session lifecycle. It creates the active data source and coordinator, closes rendered Household resources, stops sync before sign-out or replacement, and starts the fresh authorized coordinator after offline Home reopen.

Active List owns visible List interaction and rendering. It subscribes to coordinator status, requests `localWrite` after successful local mutations, requests `manualRefresh` for explicit refresh, and reloads visible rows after sync reports remote changes.

Future network-awareness belongs behind coordinator-owned adapter boundaries. It should feed the coordinator another reasoned request instead of adding sync policy to UI, domain services, HouseholdStore, or native package call sites.

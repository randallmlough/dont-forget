# Offline Item sync failure

Date: 2026-05-20

Status: Resolved

## Summary

After the domain-first service layer migration, Home could create Items locally but could fail to sync them to the remote Household DB. The first visible symptom was that adding an Item from the Active List form appeared to do nothing and no remote Items existed in Turso. After local Item creation was repaired, airplane-mode testing exposed two follow-on problems: expected offline sync attempts were logged as errors, and the app could enter a one-second native Turso sync retry loop when connectivity changed.

The user-facing requirement did not change: Item writes must commit locally while offline, stay visible in Home, and sync when connectivity returns.

## Impact

- Members could create Items locally but remote Household DBs could remain empty, so other devices would not receive those Items.
- Offline writes could show `Sync failed - changes saved locally` even though the app was behaving as designed for airplane mode.
- Reconnect could report `active list native sync failed` for a recoverable native sync checkpoint issue.
- Returning to offline after reconnect could repeatedly call Turso native sync once per second, producing repeated `[Turso HTTP] Request failed` logs for `/pull-updates`.

## Detection

The issue was found manually while testing Home in the iOS Simulator through RocketSim. The key clues were:

- Adding an Item from the form produced no network request and Turso Platform showed zero remote Items.
- Simulator logs showed native DB errors such as `statement has been finalized` and WAL short-read failures around local writes and sync.
- Direct local DB inspection showed Items existed in the simulator Household DB even when the UI reported failure.
- Direct Turso queries showed remote Household DB `items` rows were missing before the fallback fix.
- Airplane-mode testing showed local Item writes worked, but sync attempts were logged as app errors.
- Reconnect/offline cycling showed native Turso `/pull-updates` retries every second.

## Reproduction

Initial no-remote-Items reproduction:

1. Open Home in the iOS Simulator.
2. Use RocketSim to inspect the Active List screen.
3. Enter an Item name in the `Item name` field and tap `Add`.
4. Observe that the local DB contains the Item, while Turso Platform does not.
5. Query recent simulator logs and observe native Household DB sync/write failures.

Offline/reconnect reproduction:

1. Put the simulator in airplane mode.
2. Add an Item from the Active List form.
3. Observe that the Item appears locally and the List count updates.
4. Observe the app logging `active list sync failed` with `TypeError: Network request failed`.
5. Reconnect networking and let sync run.
6. Observe `active list native sync failed` with `unable to checkpoint synced portion of WAL`.
7. Go back offline.
8. Observe repeated Turso native HTTP failures for `/pull-updates` at roughly one-second intervals.

## Root Causes

### 1. Local writes and sync operations overlapped on one native DB handle

The service-layer migration introduced a cleaner `HouseholdStore` seam, but native DB operations were not serialized inside that seam. Local Item writes, pulls, pushes, syncs, and close calls could overlap on the same Turso native DB handle. In practice, this produced errors such as finalized statements and WAL read/checkpoint failures.

Because the error happened near the local write and follow-up sync boundary, the UI could treat a locally committed Item as an add failure.

### 2. Native sync success did not prove remote Items existed

The app trusted the native sync path as the only propagation mechanism. Testing showed local Items could be present in the simulator DB while the remote Turso Household DB still had zero `items` rows.

That left offline or failed-sync Items stranded locally.

### 3. Sync responsibility was split across layers

`ActiveList` called `dataSource.sync()` after local writes, while `active-list-data-source` also requested sync internally after `addItem` and `setItemChecked`. This created duplicate sync attempts and made it hard to reason about which layer owned offline retry behavior.

This contradicted the ADR-0011 direction that domain services commit local Household writes only and sync timing is an application/runtime policy owned by Home composition.

### 4. Expected offline transport failures were reported as app errors

`TypeError: Network request failed` is expected while the simulator/device is offline. The UI should move into an offline/pending state, not report an application error.

The logger boundaries did not distinguish expected sync interruptions from unexpected sync failures.

### 5. Automatic retry used native sync too aggressively

The first offline retry fix retried every second and called full native sync. When the device went offline again, that caused repeated native Turso `/pull-updates` requests. The Turso package logs those HTTP failures before app-level catch handlers can classify them, so the app produced noisy Metro errors even though local data was safe.

## Fix

### Serialize `HouseholdStore` operations

`HouseholdStore` now queues all native DB work on one handle:

- `execute`
- `push`
- `pull`
- `sync`
- `close`

This prevents local writes and sync operations from racing each other inside the same native DB file.

### Add an app-owned remote upsert recovery path

The Active List data source now pushes local `lists`, `items`, and `item_checks` rows to the remote Household DB using an app-owned LWW upsert fallback. The fallback uses each row's app-owned `updated_at` value so it matches the domain conflict strategy documented in `CONTEXT.md` and ADR-0009.

Full manual sync still tries native sync first, then runs the app-owned upsert path.

### Move sync orchestration to the Active List component

Local `addItem` and `setItemChecked` now only commit local Household DB changes. They do not start hidden sync attempts inside the data source.

The Active List component owns sync after local writes and retry behavior.

### Classify expected sync interruptions

The error helper now classifies:

- offline network errors such as `Network request failed`
- recoverable native sync engine interruptions such as `unable to checkpoint synced portion of WAL`

Expected sync interruptions no longer emit app error logs when local data is safe or when fallback recovery succeeds.

### Avoid native sync in automatic offline retry

Automatic retry uses `sync({ mode: "pushLocalOnly" })`, which runs the app-owned remote upsert path without calling native Turso sync. This avoids the native `/pull-updates` loop while still allowing locally committed Items to reach the remote DB after connectivity returns.

The retry cadence is 30 seconds while Home is foregrounded, plus an immediate attempt when the app returns active.

## Verification

Runtime checks:

- RocketSim reproduced the original add-from-form issue.
- Local simulator Household DB inspection confirmed Items committed locally.
- Direct Turso remote queries confirmed Items were missing before the remote upsert fix and present after it.
- RocketSim airplane-mode testing confirmed adding an Item keeps it visible locally and shows `Offline - changes saved locally`.

Automated checks added:

- `HouseholdStore` serializes operations on one native DB handle.
- Native offline sync errors do not error-log expected network failures.
- Recoverable WAL checkpoint sync-engine failures do not error-log at the store boundary.
- Active List shows offline state without discarding local Item changes.
- Active List does not retry offline sync every second.
- Automatic retry uses `pushLocalOnly`.
- Active List data source can push local rows without native sync.
- Local Item/check writes do not start hidden sync attempts.

Final proof:

```sh
make verify
```

passed with 24 suites and 97 tests.

## Follow-up Work

### Add a first-class Household sync coordinator

Home currently owns sync policy through Active List composition. That was enough to repair this failure, but the policy is now important enough to deserve a small app-owned coordinator under the Household domain.

The coordinator should own:

- foreground retry cadence
- app active/inactive transitions
- full sync vs push-local-only sync selection
- expected sync interruption classification
- one in-flight sync per Household

### Add network-awareness instead of timer-only retry

The app should know when connectivity changes instead of relying only on foreground timers. A network-aware sync coordinator could retry immediately when the device comes online and avoid remote attempts while the device is known offline.

Evaluate Expo/React Native network APIs and keep the dependency behind an app-owned boundary so tests can simulate online/offline transitions deterministically.

### Add native E2E coverage for offline Item writes

Add a Maestro or RocketSim-driven flow once the project has a native E2E harness:

1. Start online and open Home.
2. Go offline.
3. Add an Item.
4. Assert the Item remains visible and the UI says changes are saved locally.
5. Return online.
6. Assert the remote Household DB eventually contains the Item.
7. Return offline.
8. Assert there is no one-second native sync error loop.

### Keep sync fallback documented as temporary infrastructure

The app-owned remote upsert fallback exists because native sync package `0.6.0` can strand local rows after checkpoint failures. Keep this in ADR-0009 and remove it only when a newer native sync path is proven not to strand offline writes.

### Tighten observability contracts

Add conventions for sync logging:

- expected offline/unavailable states should be `debug` or silent
- recoverable native sync failures should be silent when fallback succeeds
- fallback failures should log only once at the data-source/coordinator boundary
- local write failures should remain errors because they affect user data safety

### Track pending local changes explicitly

Today the app infers pending sync state from operation outcomes. A future sync coordinator should track whether the Household has known local changes pending remote propagation, either from Turso CDC metadata or an app-owned lightweight marker.

This would let the UI distinguish:

- fully synced
- local changes pending
- offline with local changes pending
- retry failed but local changes are safe

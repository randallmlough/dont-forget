# Defer Local-Write Sync While Known Offline

## Context

Don't Forget requires local-first Household data: List and Item writes must commit to the local Household DB while offline, remain visible in Home, and sync after connectivity and authorization are available again.

Recent iOS Simulator airplane-mode testing showed the app still attempts Turso sync after local Item writes even when the active Household surface already reports `Offline - changes saved locally`. The user-visible Item behavior is mostly correct, but the runtime still emits noisy Turso transport errors such as `[Turso HTTP] Request failed` while the simulator has no internet connection.

## Issues We Have Been Experiencing

- Local Item writes succeed offline, but the follow-up sync path can still call Turso immediately.
- The Turso React Native package logs some HTTP failures directly before app-level code can classify the thrown error as expected offline behavior.
- The UI/coordinator can already be in `offline` status, while the platform network adapter may still be stale, `unknown`, or imprecisely `online`.
- RocketSim airplane-mode testing can therefore show the correct local-first UI state and still produce Metro/LogBox noise from a doomed remote sync attempt.
- This makes expected offline behavior look like an application error and hides genuinely unexpected sync failures in log noise.

## What We Have Tried

### Classify expected offline errors

The sync boundary classifies expected connectivity failures as offline behavior instead of application failures. That keeps local data safe and prevents app-owned error logs for normal airplane-mode sync interruptions.

This is necessary, but not sufficient: Turso can still log its own transport failure before the coordinator receives the error.

### Use `pushLocalOnly` for automatic local-write and retry paths

Automatic local-write and retry paths avoid full native pull work and prefer the narrower local-push path. That reduced the earlier native `/pull-updates` retry noise and keeps automatic propagation focused on locally committed Household rows.

This is still not sufficient when there is no connection at all: even a push-only remote attempt is doomed while known offline.

### Refresh platform network state before sync

The coordinator now refreshes the app-owned network adapter before starting sync and skips the remote call when the refreshed status is `offline`.

This helps with stale online state, but it does not cover every case. On iOS, reachability can remain stale or ambiguous around simulator airplane mode. More importantly, if the coordinator already knows sync is offline from a previous failure, a new local Item write should not need another Turso attempt just to rediscover the same fact.

### Consider suppressing Turso console noise

Filtering the Turso SDK's direct `[Turso HTTP] Request failed` console output can reduce LogBox/Metro noise, but it is a symptom fix. It does not stop unnecessary remote work, and it risks hiding useful SDK diagnostics if applied too broadly.

## Recommended Solution

Treat coordinator-owned `offline` status as a sync policy gate for automatic `localWrite` requests.

When a local List or Item mutation commits successfully and then requests `localWrite` sync:

1. Record that there is pending local Household work.
2. If the coordinator status is already `offline`, do not call Turso and do not refresh solely for that local write.
3. Keep the surface in `offline` so the Member sees that changes are saved locally.
4. Wait for a stronger recovery trigger before trying remote sync again.

Recovery triggers should still be allowed to test connectivity and catch up:

- `networkReconnect`: run when the app receives a known-online transition.
- `appForeground`: run when the active app returns and may need catch-up.
- `manualRefresh`: run because the Member explicitly asked for catch-up.
- `retry`: run on the coordinator-owned cadence when the app is active and the network adapter is not known offline.

This makes `localWrite` a local-first propagation hint, not a remote connectivity probe.

## Best-Practice Evidence

This direction matches upstream local-first and platform guidance:

- Turso Sync's offline-first guidance says apps that need offline writes should write locally and call `push()` when the connection is available; local changes remain safe in the database file until a later push succeeds. See [Turso Sync usage: Offline-first writes](https://docs.turso.tech/sync/usage#offline-first-writes).
- Turso's React Native bindings describe local writes as working offline and remote sync as an explicit `push`/`pull` action to run when connected. See [Introducing React Native Bindings for Turso](https://turso.tech/blog/react-native-bindings-for-turso).
- NetInfo exposes `isConnected` and `isInternetReachable` as nullable state and documents iOS cases where simulator or background network changes can leave app state stale until foreground refetch. See [`@react-native-community/netinfo` README](https://github.com/react-native-netinfo/react-native-netinfo).
- Apple's networking guidance warns that preflight reachability checks are not fully reliable because network conditions change frequently. The policy should therefore avoid unnecessary probes when the app already knows it is offline, while still treating actual network errors as expected interruptions if a recovery trigger races with connectivity loss. See [SCNetworkReachability deprecation guidance](https://developer.apple.com/documentation/systemconfiguration/scnetworkreachability-g7d).
- General offline-first architecture guidance recommends queued writes and draining them when connectivity is available, with retry/backoff rather than repeated immediate network attempts. See [Android offline-first data layer guidance](https://developer.android.com/topic/architecture/data-layer/offline-first).

## Implementation Outline

- In `lib/services/sync/sync-coordinator.ts`, increment the pending local change version for `localWrite` before any early return.
- Add an early return for `reason === "localWrite" && status === "offline"` so known-offline local writes do not start Turso sync.
- Keep `manualRefresh`, `networkReconnect`, `appForeground`, and `retry` eligible to refresh network state and attempt sync according to existing policy.
- Ensure pending local change state survives the skipped local-write attempt so a later reconnect/retry can propagate the rows.
- Update `docs/how-things-work/sync-coordinator.md` to describe the distinction between automatic local-write hints and recovery/catch-up triggers.

## Regression Tests

Add focused sync coordinator coverage for these cases:

- After a sync attempt transitions the coordinator to `offline`, a subsequent `localWrite` records pending work but does not call the sync operation again.
- The skipped `localWrite` does not erase pending local work.
- A later `networkReconnect`, `appForeground`, `manualRefresh`, or eligible `retry` can still run sync and clear pending work on success.
- Existing behavior remains unchanged when status is `synced` or `pending` and connectivity is not known offline.

## Runtime QA Plan

Use RocketSim and the iOS Simulator because this is native runtime behavior:

1. Start the app with `make start` and launch iOS from the Metro terminal.
2. With networking enabled, add an Item and confirm it appears locally.
3. Enable airplane mode in RocketSim.
4. Add another Item.
5. Confirm the Item appears locally and the UI says `Offline - changes saved locally`.
6. Confirm Metro/LogBox does not show `[Turso HTTP] Request failed` for the offline local write.
7. Disable airplane mode.
8. Confirm reconnect or foreground catch-up syncs the pending Item without manual DB intervention.
9. Confirm items exist in Turso remote database after resync.

## Acceptance Criteria

- Offline local Item writes remain fast and local-first.
- Known-offline `localWrite` requests do not call Turso.
- Pending local changes still sync after reconnect or another recovery trigger.
- Expected offline behavior does not produce app-owned error logs or Turso HTTP LogBox noise during the skipped local-write path.
- Unexpected sync failures remain visible at the coordinator boundary.

## Non-Goals

- Do not change HouseholdStore's local write semantics.
- Do not move sync policy into List or Item services.
- Do not depend on perfect NetInfo accuracy for correctness.
- Do not globally silence all Turso logs as the primary fix.

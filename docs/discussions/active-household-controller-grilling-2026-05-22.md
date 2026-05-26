# Active Household Controller Grilling Notes

Date: 2026-05-22

This note captures the decisions made while stress-testing the Active Household controller refactor. It exists so another agent or a restarted conversation can continue the design review without re-litigating settled points or accidentally drifting back to Home-owned Household database lifecycle.

## Context

The app has had multiple lifecycle bugs around active Household DB resources:

- Automatic local-write sync previously produced excessive network requests because the row-by-row remote upsert fallback became the default local-write path.
- Startup later hit `Database is closed` because `useHomeContent` could close a pending cached Household data source while its initial load was still in flight.

Those bugs were patched, but the deeper problem is architectural: route/UI code participates too much in opening, replacing, syncing, and closing Household DB resources. The new direction is an app-owned Active Household controller that owns the signed-in active Household resource graph.

Related docs updated during this discussion:

- `CONTEXT.md`
- `docs/adr/0012-active-household-controller.md`
- `docs/code-standards/architecture.md`
- `docs/code-standards/testing.md`
- `docs/how-things-work/routing.md`
- `docs/how-things-work/services.md`
- `docs/how-things-work/sync-coordinator.md`

## Decisions Made

### 1. Use an app-owned Active Household controller singleton

There should be at most one Active Household controller for the signed-in app session. It is a controller singleton for the app's current active Household, not a casual raw global database singleton.

The controller owns a coherent resource graph:

- cached/fresh Household Session loading
- one active HouseholdStore for the active Household
- List and Item service composition
- Current List data source behavior
- sync coordinator lifecycle
- cached-to-fresh replacement
- close/delete policy
- sign-out cleanup integration where appropriate

Screens and components borrow controller state/actions. They do not open or close Household DB connections directly.

### 2. Stop treating Home as the app-level active Household owner

Home is currently the first signed-in route that renders the active Household's Current List. It should not be documented or implemented as the owner of active Household infrastructure.

This matters because the app is still early in development. Overusing "Home" in system docs encouraged future work and AI agents to treat Home as the entire signed-in application surface. The better boundary is active Household infrastructure, with Home as one consumer.

### 3. Put controller implementation under the Household service area

The agreed location is:

```txt
lib/services/household/active-household-controller.ts
```

This keeps the controller near `HouseholdSessionService` and `HouseholdStore`, and follows the existing domain-first service-layer shape. The controller is infrastructure code nested under the owning domain; it is not a screen module.

Likely public API shape:

```ts
createActiveHouseholdController(...)
getDefaultActiveHouseholdController()
resetDefaultActiveHouseholdControllerForTests()
```

Exact names still need implementation-level review.

### 4. Use an Active Household provider for React subscription/access

Use a provider pattern, but keep ownership precise:

- The controller owns resources and lifecycle policy.
- The provider bridges React, auth/token inputs, subscriptions, and app actions.

The provider should live outside screens, likely:

```txt
components/active-household/active-household-provider.tsx
```

It should be mounted from:

```txt
app/(app)/_layout.tsx
```

The provider should eagerly activate the Active Household controller for signed-in routes. Individual screens should consume controller state/actions through `useActiveHousehold()` or a similar hook.

Do not put this provider in root `app/_layout.tsx`; root remains for app-wide providers and routing side effects such as Clerk, PostHog, theme, auth gate, and screen tracking.

### 5. Keep the controller Household-wide, not Active-List-shaped

The controller must not encode a one-List Household model. The app should eventually allow a Household to have many Lists and let the User switch between them.

Use **Current List** as the term for the List a Member is currently viewing/editing in the active Household. The Household Session provides an initial Current List; that does not mean the Household owns only one List.

For the first implementation:

- controller snapshot uses `currentList`
- component remains `ActiveList` for compatibility
- omit `lists` until List switching is implemented
- defer `selectCurrentList(listId)` until a real List-switching slice

The implementation should still make future List switching straightforward by treating Current List as selection state inside the active Household controller, not as resource identity.

### 6. Controller resource identity is Household ID

The controller/resource graph is keyed by active Household ID. Current List ID is selection state within that controller.

If cached session says Household `H1`, Current List `L1`, and fresh session returns Household `H1`, Current List `L2`, this is not a Household resource replacement. The controller may publish fresh state with `currentList = L2` for now. Future explicit List switching should preserve a selected Current List across session refresh if it is still valid.

### 7. Omit `lists` until List switching is implemented

Do not add placeholder `lists: []` or a speculative List summary service in the first controller refactor. The controller should be named and shaped so adding `lists` later is natural, but the first slice should not expose a misleading empty collection or untested behavior.

### 8. Current-List UI actions stay on a borrowed data source for the first slice

For compatibility with the existing `ActiveList.Provider`, keep Item/List write operations on the borrowed Current List data source in the first implementation.

The controller is the factory and owner of that data source. UI may call operations such as `load`, `addItem`, and `setItemChecked`, but must not close the data source.

Do not move directly to controller actions like `addItemToCurrentList` in this slice. Those can be reconsidered with List switching and broader Household UI.

### 9. Manual refresh remains Current-List sync/reload behavior for now

The existing `ActiveList` behavior should remain for the first slice: manual refresh requests coordinator sync with reason `manualRefresh`, then reloads the currently viewed List from its data source.

Manual refresh should not rebootstrap the entire active Household Session unless a future explicit controller action is designed for that.

### 10. Controller owns cached-to-fresh replacement internally

Callers should not dispose a cached controller and create a fresh controller when online bootstrap succeeds. The Active Household controller stays continuous and internally serializes cached-to-fresh replacement.

Provider responsibility:

- pass auth/token inputs to controller
- subscribe to controller snapshots
- expose state/actions to screens
- call sign-out/dispose in the right order

Controller responsibility:

- try cached Household Session first for offline startup
- open local HouseholdStore unauthorized when needed
- render Current List from cached local data if available
- fetch fresh Household Session when Clerk is ready
- invalidate cached Household data if fresh session no longer authorizes it
- serialize cached-to-fresh replacement
- stop old coordinator before replacement disposal
- close old store only after pending operations drain
- publish coherent snapshots to subscribers

### 11. Keep cached UI visible during safe fresh replacement

When a cached Household is still plausibly authorized, keep the cached Current List visible and writable while the controller prepares fresh authorized resources.

The controller can open the fresh resource set in the background, load the fresh Current List, then publish one replacement snapshot. It should close the old published resource set only after it is no longer current and in-flight operations have drained.

Useful snapshot state:

```ts
{ status: "loading"; previous: cachedView }
```

The outer snapshot state, not the view metadata, represents replacement progress.

### 12. Do not block writes on the published cached snapshot during replacement

If a cached Current List is visible, Item/List writes should continue to commit locally against that visible store. The controller must not close that published data source while it can still receive writes.

Rule:

> The snapshot's borrowed data source remains valid until the controller publishes a replacement snapshot; after replacement, UI uses the new borrowed data source. The controller never closes a published data source until it is no longer the current published snapshot and its in-flight operations have drained.

This scenario needs extensive tests, especially writes racing cached-to-fresh replacement.

### 13. Unauthorized cached Household is the exception

If fresh bootstrap returns a different Household or otherwise proves the cached Household is unauthorized:

1. Mark the cached snapshot/resource set invalidated.
2. Stop accepting writes through the cached published data source.
3. Dispose cached resources.
4. Delete cached metadata and local DB files for the unauthorized cached Household.
5. Publish `loading` while opening the fresh Household.
6. Publish `ready(fresh)` if opening succeeds, otherwise `error`.

Do not keep stale cached UI visible after fresh bootstrap proves it is unauthorized.

### 14. Use a new resource set and coordinator for cached/fresh opens

Cached and fresh resource sets may have distinct sync coordinators. This is preferred over mutating a coordinator from unauthorized to authorized because the coordinator currently has stable construction-time invariants: `syncAuthorized`, network adapter, timers, in-flight state, and retry policy.

The Active Household controller remains continuous even if it replaces the underlying resource set.

### 15. Sign-out should be a provider/session action, not screen cleanup

Screens should not each reimplement Clerk/cache/controller cleanup. The provider or a sibling signed-in app session boundary should expose a sign-out action that preserves the required order:

```ts
track("user_signed_out", {});
reset();
await activeHouseholdController.dispose();
await clearCachedHouseholdSession();
await clerkSignOut();
```

Home's sign-out button should call this provider action. Future screens can sign out through the same path.

### 16. Use a hard cut for the Home path

Do not keep `useHomeContent` owning resource lifecycle behind a compatibility wrapper. The Home path should be migrated to the controller/provider boundary directly.

Expected implementation slice:

1. Add `active-household-controller.ts` with tests for cached load, fresh load, cached-to-fresh swap, unauthorized invalidation, sign-out disposal, and write-during-replacement.
2. Add `ActiveHouseholdProvider` with focused tests for eager activation and sign-out action order.
3. Change `app/(app)/_layout.tsx` to wrap signed-in routes.
4. Thin `HomeScreen` to consume `useActiveHousehold()` and render `ActiveList`.
5. Delete or gut `use-home-content.ts` lifecycle ownership and move Current List data source creation out of `screens/home`.

### 17. Create ADR-0012

`docs/adr/0012-active-household-controller.md` was created to record the architectural decision. Future implementation should align with that ADR.

### 18. Use controller naming, not runtime naming

The implementation file and public API should use controller naming:

```txt
lib/services/household/active-household-controller.ts
```

```ts
createActiveHouseholdController(...)
getDefaultActiveHouseholdController()
resetDefaultActiveHouseholdControllerForTests()
```

"Runtime" was rejected as too jargon-heavy and too easy to turn into a fuzzy bucket. "Controller" better matches the mental model: one app-owned object controls activation, cached/fresh replacement, resource ownership, snapshots, and disposal. Avoid `Coordinator` because `SyncCoordinator` already has a precise meaning.

### 19. Expose the sync coordinator directly for the first hard cut

For the first implementation, the controller snapshot may expose the existing `SyncCoordinator` directly as a borrowed Current List handle. `ActiveList.Provider` already consumes this contract, and keeping it avoids mixing lifecycle ownership changes with a broader UI-state refactor.

Preferred first-slice shape:

```ts
currentList: {
  initialState: CurrentListInitialState;
  dataSource: CurrentListDataSource;
  syncCoordinator: SyncCoordinator;
}
```

The coordinator remains owned by the Active Household controller. UI may subscribe/request sync through it, but must not stop or dispose it.

### 20. Use `ActiveHouseholdView` for the ready snapshot value

The controller snapshot should be a small discriminated union:

```ts
type ActiveHouseholdSnapshot =
  | { status: "idle" }
  | { status: "loading"; previous?: ActiveHouseholdView }
  | { status: "ready"; value: ActiveHouseholdView }
  | { status: "error"; message: string; previous?: ActiveHouseholdView };
```

`idle` represents the controller before the provider has enough auth state to activate. `previous` lets the controller model non-destructive cached-to-fresh replacement without flickering the UI to a blank loading state.

Use `ActiveHouseholdView` for the ready value. `ActiveHouseholdReadySnapshot` was rejected as clunky, and `ActiveHouseholdContext` would conflict mentally with React Context. `ActiveHouseholdView` means the controller's current view of the active Household resource graph for consumers, not a raw domain model or server payload.

The first-slice view should be Household-wide while only exposing the Current List:

```ts
type ActiveHouseholdView = {
  household: { id: string; name: string };
  activeMember: {
    id: string;
    userId: string;
    displayName: string | null;
    role: "owner" | "member";
  };
  members: ActiveHouseholdMember[];
  currentList: {
    id: string;
    initialState: ActiveListInitialState;
    dataSource: ActiveListDataSource;
    syncCoordinator: SyncCoordinator;
    resourceKey: string;
  };
  meta: {
    source: "cached" | "fresh";
  };
};
```

Replacement/refresh progress is represented by the outer snapshot state, not by mutating `ActiveHouseholdView.meta`. Consumers can derive `isRefreshingSession` from `snapshot.status === "loading" && snapshot.previous`.

`currentList.resourceKey` is required. It is an opaque render key that changes whenever the borrowed Current List resource set changes. Consumers should use it to remount `ActiveList.Provider` when the controller publishes a replacement data source/coordinator:

```tsx
<ActiveList.Provider
  key={view.currentList.resourceKey}
  initialState={view.currentList.initialState}
  dataSource={view.currentList.dataSource}
  syncCoordinator={view.currentList.syncCoordinator}
>
```

The controller may construct it from Household ID, Current List ID, and a resource generation, but UI must not parse it. Future Current List switching should also change this key.

### 21. `useActiveHousehold()` exposes raw snapshot and derived view

The Active Household provider hook should expose the raw controller snapshot plus simple derived values for screens:

```ts
type ActiveHouseholdContextValue = {
  snapshot: ActiveHouseholdSnapshot;
  view: ActiveHouseholdView | null;
  isRefreshingSession: boolean;
  signOut: () => Promise<void>;
  retry: () => void;
};
```

Derivation:

```ts
const view =
  snapshot.status === "ready" ? snapshot.value : snapshot.previous ?? null;

const isRefreshingSession =
  snapshot.status === "loading" && Boolean(snapshot.previous);
```

Screens can stay simple by rendering `view` when available, while still consulting the raw `snapshot` for loading/error states.

### 22. Use a separate controller lifecycle queue

The Active Household controller should have its own lifecycle queue, separate from the `HouseholdStore` database operation queue.

The controller queue serializes high-level state transitions:

- `activate`
- cached load
- fresh session load
- cached-to-fresh replacement
- unauthorized invalidation
- `dispose`
- future Current List switching

The `HouseholdStore` queue continues to serialize DB operations for one native store handle. Current List data-source reads and writes may continue on the currently published store while the controller prepares a replacement. A separate resource lease/drain rule prevents closing a published resource set while borrowed operations are in flight.

### 23. Use activation `runId`s to ignore stale async completions

Each controller activation should use an opaque `runId`/request id. Async completions may publish snapshots, replace resources, save cache, or delete data only if their `runId` is still current and the controller has not been disposed.

This is preferred over relying on `AbortController` for the first slice because the involved dependencies are not consistently abortable: native store open/close, AsyncStorage, and some service calls may continue after a newer activation or sign-out.

Rules:

- Every `activate()`/`retry()` starts a new `runId`.
- Async work captures its `runId`.
- Before publishing or performing destructive side effects, the controller checks that the `runId` is still current.
- `dispose()` invalidates the current `runId`, marks the controller disposed, stops publishing, then drains/cleans current resources.
- If stale async work finishes after being superseded, it must not publish; if it opened resources, it should close them best-effort.

This protects against late cached/fresh loads publishing after sign-out or older retries overwriting newer activation results.

### 24. Wrap borrowed Current List resources with lease/drain guards

The controller should wrap each controller-owned Current List data source with a lease/drain guard. Every public data-source method runs inside a lease:

```ts
load: () => withLease(() => innerDataSource.load())
addItem: (name) => withLease(() => innerDataSource.addItem(name))
setItemChecked: (...) => withLease(...)
sync: (...) => withLease(...)
```

The guard increments an in-flight count before delegating and decrements it afterward. Replacement/disposal waits for a retiring resource's in-flight count to reach zero before stopping its coordinator and closing its data source/store.

Replacement flow:

1. Publish resource A.
2. Prepare resource B.
3. Publish resource B.
4. Mark resource A as `retiring` so new calls reject.
5. Wait for A's in-flight operations to drain.
6. Stop A coordinator and close A data source/store.

This keeps writes enabled on the currently published cached snapshot during safe replacement while preventing new writes through stale handles after a replacement has been published.

### 25. Reject stale borrowed calls with a typed error

When a retired Current List resource receives a new call after replacement, it should reject with a typed error:

```ts
export class StaleActiveHouseholdResourceError extends Error {
  constructor() {
    super("Active Household resource is no longer current");
    this.name = "StaleActiveHouseholdResourceError";
  }
}
```

This gives tests and UI error handling a precise signal. Stale-resource errors are expected during replacement/remount races and should not be logged as unexpected Item/List failures.

### 26. Use `resourceKey` remounting as the `ActiveList.Provider` replacement contract

For the first hard cut, `ActiveList.Provider` does not need to reconcile data-source/coordinator prop changes internally. Screens should pass `view.currentList.resourceKey` as the React `key` so the provider remounts when the controller publishes a new Current List resource set:

```tsx
<ActiveList.Provider
  key={view.currentList.resourceKey}
  initialState={view.currentList.initialState}
  dataSource={view.currentList.dataSource}
  syncCoordinator={view.currentList.syncCoordinator}
  closeDataSourceOnUnmount={false}
  manageSyncCoordinatorLifecycle={false}
>
```

Remounting is preferred because `ActiveList.Provider` initializes reducer state, refs, subscriptions, and optimistic Item bookkeeping from the original resource set. Prop-change reconciliation can be considered later only if a concrete UX need appears.

### 27. Put first-slice sign-out on `ActiveHouseholdProvider`

For the first controller slice, expose `signOut` directly from `useActiveHousehold()`.

The required sign-out order is tightly coupled to active Household disposal and cache/local DB cleanup:

```ts
track("user_signed_out", {});
reset();
await activeHouseholdController.dispose();
await clearCachedHouseholdSessionMetadata();
await delete local Household DB files as needed;
await clerkSignOut();
```

A broader signed-in session provider can be extracted later if signed-in app state grows beyond Household concerns. Do not add that extra abstraction in the first slice.

### 28. Sign-out proceeds after local cleanup failures

If active Household disposal or local cache/DB cleanup fails during sign-out, log the failure but still call Clerk `signOut()`. Blocking Clerk sign-out would trap the User signed in, which is worse than leaving local cleanup to a later authorization/invalidation path.

Suggested flow:

```ts
track("user_signed_out", {});
reset();

try {
  await activeHouseholdController.dispose();
} catch (error) {
  logger.error("active Household dispose before sign-out failed", { error });
}

try {
  await clearCachedHouseholdSessionMetadata();
  await deleteLocalHouseholdStoreData(...);
} catch (error) {
  logger.error("active Household local cleanup before sign-out failed", { error });
}

await clerkSignOut();
```

### 29. `dispose()` publishes `idle`

Controller `dispose()` should invalidate current work/resources and publish `{ status: "idle" }`. This prevents signed-in screens from continuing to render stale Household data if Clerk redirect is delayed, and gives tests a clear terminal state.

The provider may also keep local `isSigningOut` UI state if needed, but the controller's post-dispose snapshot is `idle`.

### 30. Inject stable infrastructure/domain factories, not per-UI-resource data-source factories

Do not inject a `createCurrentListDataSource` factory into the controller. That would make the controller dependency list grow with UI resource names, such as a future `householdSettingsDataSource`, and would be fragile over time.

The controller should compose feature resources internally from stable Household infrastructure and domain service boundaries:

```ts
type ActiveHouseholdControllerDeps = {
  householdSessionService?: HouseholdSessionService;
  openStore?: typeof openHouseholdStore;
  deleteLocalHouseholdStoreData?: typeof deleteLocalHouseholdStoreData;
  createListService?: typeof createListService;
  createItemService?: typeof createItemService;
  createSyncCoordinator?: typeof createDefaultSyncCoordinator;
  logger?: Logger;
};
```

Once services are created inside a resource set, use simple instance names such as `listService` and `itemService`. Keep factory dependency names honest when the value is a factory function.

Use flat factory dependency keys such as `createListService` and `createItemService`. Already-created service instances are not suitable controller dependencies because each controller resource set needs services bound to that specific Household ID and HouseholdStore. During cached-to-fresh replacement, more than one resource set may briefly be alive, so services must be created per resource set.

### 31. Keep Current List data-source composition as production helper code

The Current List data-source logic is production composition code, not a test-only factory. It adapts ListService and ItemService instances into the `ActiveList.Provider` contract by loading the Current List, mapping Items into UI-facing rows, performing Item writes, and delegating sync/pull.

Keep it as a controller-internal helper module under the Household service area, for example:

```txt
lib/services/household/current-list-data-source.ts
```

The Active Household controller owns creating it. Screens should not import it directly, and it does not need to be exported from `lib/services/household/index.ts`. Test-only fixtures/factories should live separately under test helpers if needed.

### 32. Test cached-to-fresh write races with deterministic Jest tests

Use two test layers:

1. Controller unit/integration tests with fakes for precise race control:
   - cached view is published
   - `addItem` starts and is held pending
   - fresh replacement publishes a new resource
   - old resource is marked retiring
   - old resource is not closed until pending write resolves
   - new calls on old resource reject with `StaleActiveHouseholdResourceError`

2. Current List data-source focused tests for behavior independent of controller replacement:
   - maps List/Items/Members correctly
   - writes through `ItemService`
   - local writes do not perform row-by-row fallback directly
   - sync delegates according to the coordinator/data-source contract

Do not rely on Maestro for this race. It is too timing-sensitive for native E2E and should be proven deterministically in Jest. Maestro can later cover user-visible offline/online behavior.

### 33. Revise misleading ADR-0011 Home ownership language

ADR-0011 should preserve the historical initial Home/List/Item migration slice, but it should not keep steering new active Household resource ownership toward Home. It has been patched so ADR-0012 supersedes Home-owned active Household resource composition, while ADR-0011 still records the domain-first service-layer decision.

### 34. Revise Storybook docs away from Home-owned composition

`docs/how-things-work/storybook.md` has been patched so Storybook guidance still recommends fixture/local state for stories, but production active Household state is described as coming from the Active Household provider and controller-owned Household data sources. This avoids reinforcing the old Home-owned Active List composition boundary.

## Fast Follow

### Create an Active Household controller how-things-work doc after implementation

Defer `docs/how-things-work/active-household-controller.md` until after implementation settles the actual APIs and behavior. ADR-0012 and this discussion note are enough for design continuity during grilling. The how-things-work doc should describe implemented contracts rather than speculative interfaces.

### Consider a controller-owned sync facade

After the hard cut lands, consider hiding `SyncCoordinator` behind a controller-owned sync facade:

```ts
sync: {
  status: SyncStatus;
  subscribe(...): SyncStatusSubscription;
  requestManualRefresh(): Promise<void>;
  requestLocalWriteSync(): Promise<void>;
}
```

This may become worthwhile when more `ActiveList` behavior moves into Household-level UI actions or when Current List switching needs a narrower sync contract. Do not take this on in the first controller slice unless the direct coordinator handle creates concrete coupling problems.

## Open Questions

Continue grilling from here before implementation.

### Snapshot and subscription API

No open questions currently.

### Controller concurrency model

No open questions currently.

### Borrowed data-source invalidation

No open questions currently.

### Sign-out API

No open questions currently.

### Test seams and factories

No open questions currently.

### Documentation cleanup after implementation

No open questions currently.

# Worker Notes

This file is for the implementation agent working through this task.

Update it continuously with assumptions, decisions, discoveries, commands run, test results, and follow-up work that should be visible to reviewers or later agents.

## 2026-06-08 Implementation Worker

### Starting Context

- Confirmed repo path: `/Users/randy/Dev/personal/dont-forget-wt/list-creation-switching-mvp`.
- Confirmed branch: `task/list-creation-switching-mvp/5-home-active-list-resolver`.
- Initial tracked `git status --short` was clean.
- Read `AGENTS.md`, `CONTEXT.md`, Task 5 `README.md`, Task 5 `state.json`, and this worker notes file.
- Read relevant dependency docs/notes for Tasks 3 and 4:
  - Task 3 added `ListService.listLists({ archive: "active", sort: "recentActivity" })` with active non-deleted summaries ordered by recent activity.
  - Task 4 added local Current List selection helpers scoped by app `userId + householdId`; storage does not validate List lifecycle state.
- Relevant domain docs searched/read: `docs/how-things-work/authenticated-app-session.md`, `docs/how-things-work/services.md`, `docs/how-things-work/storybook.md`, `docs/how-things-work/routing.md`, `docs/how-things-work/testing.md`, `docs/adr/0012-authenticated-app-session-controller.md`, and code standards references found by search.

### Assumptions

- Home should own only Current List resolution and List/Item loading after an Authenticated App Session exists; it should not move List state into the session provider or `ListService`.
- Automatic fallback is resolver behavior only. It must not call `setCurrentListSelection`.
- Stored selection should be cleared only when a stored candidate is present and proves invalid for the current active List set or typed lifecycle read.
- Typed `getList().missing` and `getList().deleted` are expected stale lifecycle races for this resolver attempt; thrown failures remain retryable Home/List errors.

### Plan

1. Inspect Home route, Active List boundary, service types, storage helpers, and existing tests.
2. Add a Home-owned active List resolver with explicit `loading | active | zeroActive | error` states.
3. Update Home rendering so `ActiveList.Provider` mounts only for the resolved active List and is keyed by `session.resourceKey + resolvedListId`.
4. Add focused Home/resolver tests covering the task QA list.
5. Run focused tests, `make typecheck`, and `make verify`, then commit with standard git.

### Commands Run

- `pwd && git status --short && git branch --show-current`
- `sed` reads for required repo/task docs and applicable React Native skill guidance.
- `rg` searches across `app`, `docs`, and task notes for `DEFAULT_LIST_ID`, `ActiveList`, `Current List`, `listLists`, `getList`, storage helpers, and `resourceKey`.
- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> failed once because the zero-active test asserted `Avery` while the signed-in Member bar renders `Avery Chen`; updating the assertion.
- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> passed, 18 tests.
- `make typecheck` -> passed.
- `make verify` -> failed at `biome ci .` due import ordering/formatting in touched Home files; running Biome write on touched files.
- `pnpm exec biome check --write screens/home/home-current-list.tsx screens/home/home-screen.stories.tsx screens/home/home-screen.test.tsx screens/home/use-home-active-list-resolver.ts` -> fixed 4 files.
- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> passed after formatting, 18 tests.
- `make typecheck` -> passed after formatting.
- `make verify` -> passed. Includes `tsc --noEmit`, `biome ci .`, custom ESLint rule tests, `eslint .`, and full Jest. Jest result: 51 suites, 354 tests. Expected PostHog missing-token warnings appeared in existing analytics/API tests.
- `rg -n "DEFAULT_LIST_ID" screens/home` -> no matches after removing the old test-only seed assertion.
- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> passed after removing the test-only default List reference, 18 tests.
- `make typecheck` -> passed final run.
- `make verify` -> passed final run. Includes `tsc --noEmit`, `biome ci .`, custom ESLint rule tests, `eslint .`, and full Jest. Jest result: 51 suites, 354 tests. Expected PostHog missing-token warnings appeared in existing analytics/API tests.

### Files Changed

- `screens/home/use-home-active-list-resolver.ts` - new Home-owned Current List resolver.
- `screens/home/home-current-list.tsx` - removed `DEFAULT_LIST_ID` selection, added resolver states, zero-active rendering, and resource/list boundary key.
- `screens/home/home-screen.test.tsx` - expanded focused Home/resolver coverage for stored selection, fallback, invalid clearing, archived/deleted selection, stale candidates, zero-active, boundary key, and resolved List Item writes.
- `screens/home/home-screen.stories.tsx` - updated story List service double with active summary loading.
- `docs/.local/features/list-creation-switching-mvp/tasks/5-home-active-list-resolver/worker-notes.md` - recorded process, commands, results, and implementation notes.

### Current Status

- No `state.json` changes made.
- No switcher UI, create/rename/archive/delete/restore behavior, switching analytics, or cross-Member lifecycle behavior added.

### Implementation Notes

- Added `screens/home/use-home-active-list-resolver.ts`.
  - Resolver output states are explicit: `loading`, `active`, `zeroActive`, and `error`.
  - It reads local Current List selection for `session.user.id + session.activeHousehold.id`.
  - It validates stored selection and fallback candidates through `listLists({ archive: "active", sort: "recentActivity" })` plus `getList({ listId })`.
  - Invalid stored selections are cleared; fallback selection is kept in memory only.
  - `getList()` typed `missing`/`deleted` results and archived available results are treated as stale/ineligible candidates for this resolution attempt.
- Updated `screens/home/home-current-list.tsx`.
  - Removed the `DEFAULT_LIST_ID` Current List path.
  - `ActiveList.Provider` only mounts after resolver state is `active`.
  - Zero-active renders the temporary display-only `No active Lists` state with no actions.
  - Active List boundary key is `session.resourceKey + resolvedListId` via `homeActiveListBoundaryKey`.
- Updated `screens/home/home-screen.stories.tsx` so Storybook service doubles implement `listLists()` for resolver loading.

## 2026-06-08 Review Round 1 Fix Worker

### Scope

- Fixed only the blocking review finding: typed `missing`/`deleted` lifecycle results from the post-resolution `useHomeCurrentList` load no longer render retryable `List unavailable`.
- Preserved Home resolver ownership; no changes moved lifecycle fallback into `ListService`, local storage, or the Authenticated App Session provider.
- Did not edit `state.json`.
- Did not add switcher, create, rename, archive, delete, restore, switching analytics, Task 6, or Task 7 behavior.

### Implementation

- `useHomeCurrentList` now preserves typed post-resolution `getList()` lifecycle results as `unavailable` state and only keeps thrown failures on the retryable error path.
- `HomeCurrentListResolver` keeps an in-memory exclusion list for Lists that became unavailable during the final Home load, then re-runs the Home-owned resolver against the remaining active candidates.
- Stored selection for a post-load unavailable List is cleared on the re-resolution pass; automatic fallback remains in memory only.
- Added focused regressions where candidate A resolves first, then the post-resolution Home load returns:
  - `missing`, causing Home to resolve candidate B without `List unavailable`.
  - `deleted`, causing Home to render zero-active when no fallback remains, without `List unavailable`.

### Commands Run

- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> failed once while tightening the zero-active setup because Hardware Store was still active; archived the remaining fallback candidate in test setup.
- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> passed, 20 tests.
- `pnpm exec biome check --write screens/home/home-current-list.tsx screens/home/use-home-active-list-resolver.ts screens/home/use-home-current-list.ts screens/home/home-screen.test.tsx` -> passed.
- `make typecheck` -> passed.
- `make verify` -> failed once on `dont-forget/no-screen-use-effect` after the first implementation placed an effect in `home-current-list.tsx`; moved the unavailable callback into `useHomeCurrentList`.
- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> passed after the lint refactor, 20 tests.
- `make typecheck` -> passed after the lint refactor.
- `make verify` -> passed. Includes `tsc --noEmit`, `biome ci .`, custom ESLint rule tests, `eslint .`, and full Jest. Jest result: 51 suites, 356 tests. Expected PostHog missing-token warnings appeared in existing analytics/API tests.

## 2026-06-08 Review Round 2 Fix Worker

### Scope

- Fixing only the round 2 adversarial review blocker: an `available` archived List returned by the post-resolution Home load must not mount as the active Home List.
- Keeping the fix in the existing Home-owned post-load unavailable path; no `ListService`, local storage, or Authenticated App Session provider changes planned.
- Did not edit `state.json`.

### Starting Context

- Confirmed repo path: `/Users/randy/Dev/personal/dont-forget-wt/list-creation-switching-mvp`.
- Confirmed current `HEAD`: `85116c4e Fix Home stale list re-resolution`.
- Initial tracked `git status --short` was clean.
- Read required docs: `AGENTS.md`, `CONTEXT.md`, Task 5 `README.md`, `state.json`, `worker-notes.md`, `qa-notes.md`, `reviewer-notes.md`, and `orchestrator-notes.md`.

### Plan

1. Inspect current Home resolver/load implementation and focused tests.
2. Classify post-resolution `available` archived metadata as unavailable/stale for Home.
3. Add regression coverage for second `getList()` returning an archived available List and falling back without mounting it.
4. Run focused Home tests, `make typecheck`, and `make verify`.
5. Commit with standard git only.

### Implementation

- `useHomeCurrentList` now classifies post-resolution `getList()` results with `status: "available"` and `list.archived === true` as `unavailable`.
- The existing `HomeCurrentListResolver` post-load unavailable callback handles that result by adding the List ID to the bounded in-memory exclusion list and re-running the Home-owned resolver.
- Added a focused regression where Groceries resolves first, the second `getList()` returns an archived available Groceries result, and Home falls back to Pharmacy without rendering the archived List or retryable `List unavailable`.

### Commands Run

- `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` -> passed, 21 tests.
- `make typecheck` -> passed.
- `make verify` -> passed. Includes `tsc --noEmit`, `biome ci .`, custom ESLint rule tests, `eslint .`, and full Jest. Jest result: 51 suites, 357 tests. Expected PostHog missing-token warnings appeared in existing analytics/API tests.

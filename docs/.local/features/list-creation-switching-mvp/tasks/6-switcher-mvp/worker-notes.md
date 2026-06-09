# Worker Notes

This file is for the implementation agent working through this task.

Update it continuously with assumptions, decisions, discoveries, commands run, test results, and follow-up work that should be visible to reviewers or later agents.

## 2026-06-08T23:57:48Z

- Started worker implementation on branch `task/list-creation-switching-mvp/6-switcher-mvp` in the task worktree.
- Read `AGENTS.md`, `CONTEXT.md`, task README, `state.json`, and the existing notes files. Confirmed I must not mutate `state.json`, must use standard git only, and must not claim QA.
- Searched `CONTEXT.md` and `docs/` for Current List/Home/List switching guidance. Relevant boundary: Current List is Home-owned selection state, not an Authenticated App Session or ListService concern.
- Fetched current Expo docs with Context7:
  - `npx ctx7@latest library "@expo/ui" "Task 6 Switcher MVP: use @expo/ui/swift-ui BottomSheet and RNHostView as a sheet shell in an Expo React Native iOS app"`
  - `npx ctx7@latest docs /expo/expo "@expo/ui/swift-ui BottomSheet RNHostView React Native content detents iOS usage"`
- Expo docs support `BottomSheet` + `Group` modifiers + `RNHostView` for React Native sheet content. For variable/flexible content, omit `matchContents` and use `presentationDetents`; this matches the task requirement not to use fit-to-content/match-contents as the row-list default.
- Source discoveries:
  - Task 5 resolver lives in `screens/home/use-home-active-list-resolver.ts` and already uses `listLists({ archive: "active", sort: "recentActivity" })`.
  - `HomeCurrentListResource` remounts Active List via `homeActiveListBoundaryKey(session, listId)`.
  - `lib/local-storage/current-list-selection.ts` exposes the local persistence API needed for explicit selection.
  - `lib/analytics-events.ts` does not yet contain `list_switched`; this task needs that typed event added and emitted only after persistence succeeds.

## 2026-06-09T00:05:35Z

- Implemented the Switcher MVP scope:
  - `ActiveList.Header` now accepts an optional Home-provided press handler for the Current List header text/progress area.
  - `HomeCurrentListResource` wraps the active List surface in `@expo/ui/swift-ui` `Host`, opens a Home-owned switcher sheet, and feeds selected List IDs back into the Task 5 resolver/remount path.
  - Added `HomeListSwitcherSheet` using `BottomSheet`, `Group`, `presentationDetents(["medium", "large"])`, `presentationDragIndicator("visible")`, and `RNHostView` without `matchContents`.
  - Added `useHomeListSwitcher` to keep loading/selection effects out of the screen component file per repo lint rules.
  - Switcher rows load with exactly `listLists({ archive: "active", sort: "recentActivity" })` and render only List name, current indicator, unchecked count, and checked count.
  - Non-current selection persists local Current List selection, then emits typed `list_switched` with `{ household_id, list_id, user_id }`, then updates Home selected List state, then closes the sheet.
  - Current row selection returns without persistence, analytics, sync request, or forced close.
- Added typed `list_switched` to `lib/analytics-events.ts`.
- Added focused Home tests for opening/dismissing the sheet, active summaries/current indication, exact no-`searchText` summary query, current-row no-op, persistence-before-analytics ordering and event shape, selected List remount, no sync request, no fallback analytics, and no `DEFAULT_LIST_ID` regression.
- Commands run:
  - `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` - passed, 26 tests.
  - `make typecheck` - passed.
  - `make verify` - passed: typecheck, Biome, local ESLint rule tests, ESLint, and all Jest suites (`51` suites, `362` tests). Existing PostHog missing-token console warnings appeared during tests.
- Did not perform live iOS Simulator QA; that remains for the required QA phase.

## 2026-06-09T01:40:00Z

- Started worker attempt 2 after QA failed live iOS Simulator verification.
- Read required task context again: `AGENTS.md`, `CONTEXT.md`, task README, `state.json`, `worker-notes.md`, `qa-notes.md`, `reviewer-notes.md`, and `orchestrator-notes.md`.
- Confirmed current scope is implementation-worker recovery only: fix the runtime blockers needed for QA, do not mutate `state.json`, do not perform QA/review, and use standard `git` only.
- Working hypotheses:
  - The `archived_at` runtime error likely comes from Task 3 summary code assuming a newer Household schema than the live local/synced Household DB files currently installed in the Simulator.
  - The seeded multi-List Household issue likely needs either a documented setup path, a seed login/session path, or a live dev reset path so QA can reach `hh_avery`.

## 2026-06-09T01:52:00Z

- Searched `CONTEXT.md`, `docs/`, and source for `archived_at`, `listLists`, `hh_avery`, seed, live env, and migration guidance.
- Key documentation finding: `docs/adr/0003-schema-migration-fanout.md` says the app does not run bundled Household migrations against synced local Household DBs and app code must tolerate the previous local schema until sync brings down newer DDL.
- Source finding: `db/migrations/household/0002_steep_ultron.sql` adds `lists.archived_at`; `lib/services/list/list-service.ts` used `archived_at` unconditionally in `createList`, `getList`, and `listLists`.
- Source precedent: `lib/services/item/item-service.ts` already probes `PRAGMA table_info(items)` so `quantity` works against pre-`0001` local schemas.
- Implemented the same schema-capability pattern for Lists:
  - `readListsSchema()` probes `PRAGMA table_info(lists)`.
  - Previous local schema without `archived_at` treats every non-deleted List as active and returns `archivedAt: null`.
  - `archive: "archived"` returns no rows until the schema has archive state.
  - `createList()` omits `archived_at` when the local schema does not have the column.
- Added a ListService regression test using `createTestHouseholdDb({ throughMigration: "0001_brainy_pride.sql" })` to cover `getList`, `listLists({ archive: "active" })`, `listLists({ archive: "archived" })`, and `createList` on the previous local schema.
- Ran `pnpm exec jest --runInBand --runTestsByPath lib/services/list/list-service.test.ts`:
  - First run failed because two existing mocked race tests did not account for the new `PRAGMA table_info(lists)` reads.
  - Updated those tests to model the schema reads explicitly and assert the guarded write call at the new index.
  - Second run passed: 1 suite / 24 tests.

## 2026-06-09T02:04:00Z

- Investigated the seeded multi-List Household live setup blocker.
- Source finding: `PRIMARY_HOUSEHOLD_SEED` intentionally uses synthetic Clerk IDs (`user_avery`, `user_blake`), so a real Clerk development user like QA's `jun7@email.com` will bootstrap into first-run Household creation unless it is joined to the seeded Household.
- Source finding: the deterministic seed also creates reusable Household Join Code `ABCDEFGH` for `hh_avery`, and the public route `app/households/join.tsx` uses `HouseholdJoinScreen`.
- Source finding: `joinByCode()` creates/reuses a plain Member Membership for the signed-in User, sets `users.active_household_id` to the joined Household, and reloads the Authenticated App Session through `usePublicHouseholdEntry`.
- Live QA setup path for the next QA agent:
  - Ensure local seed data exists with `make db-reseed APP_ENV=local CONFIRM_DB_RESET=local` when a destructive local reset is acceptable, or `make db-seed APP_ENV=local` if the migrated deterministic seed DB already exists and no seed rows exist.
  - Sign in with any real Clerk development User.
  - Open the local app deep link `dontforget-local://households/join?code=ABCDEFGH` (local scheme comes from `app.config.ts`).
  - Tap `Join Household`; the active Household should become seeded `hh_avery` / `Avery`, which has active Lists `Groceries`, `Hardware Store`, and `Pharmacy`, plus archived `Camping`.

## 2026-06-09T02:16:00Z

- Verification commands:
  - `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` - passed, 1 suite / 26 tests.
  - `make typecheck` - passed.
  - First `make verify` attempt failed at Biome formatting for `lib/services/list/list-service.ts` and `lib/services/list/list-service.test.ts`; no test/type errors.
  - `pnpm exec biome check --write lib/services/list/list-service.ts lib/services/list/list-service.test.ts` - fixed formatting only.
  - `pnpm exec jest --runInBand --runTestsByPath lib/services/list/list-service.test.ts` - passed, 1 suite / 24 tests.
  - `pnpm exec jest --runInBand --runTestsByPath screens/home/home-screen.test.tsx` - passed again, 1 suite / 26 tests.
  - `make verify` - passed: typecheck, Biome, local ESLint rule tests, ESLint, and all Jest suites (`51` suites, `363` tests). Existing PostHog missing-token warnings appeared during tests.
- Residual risk: I did not perform live iOS Simulator QA in this implementation-worker phase. The next QA pass should use the documented join-code path above to enter seeded `hh_avery` before verifying multi-row scrolling, switching, and restart persistence.

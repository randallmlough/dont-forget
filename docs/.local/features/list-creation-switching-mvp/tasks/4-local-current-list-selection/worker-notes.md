# Worker Notes

This file is for the implementation agent working through this task.

Update it continuously with assumptions, decisions, discoveries, commands run, test results, and follow-up work that should be visible to reviewers or later agents.

## 2026-06-08 - Implementation Start

- Read `AGENTS.md`, `CONTEXT.md`, task `README.md`, and `state.json`.
- Relevant domain docs read: `docs/how-things-work/authenticated-app-session.md`, `docs/how-things-work/analytics.md`, `docs/code-standards/testing.md`, and `docs/adr/0012-authenticated-app-session-controller.md`.
- Assumptions:
  - Current List selection is local app state only; no `ListService`, Home resolver, fallback, archive/delete, or zero-active behavior belongs in Task 4.
  - Storage keys must be scoped by app-owned `User.id`, not Clerk user id.
  - Sign-out cleanup must preserve order from the task README and still call Clerk `signOut()` if Current List cleanup fails.
- Initial discovery:
  - Sign-out orchestration lives in `lib/services/session/sign-out.ts`.
  - Existing provider tests cover sign-out order/failure paths in `components/session/authenticated-app-session-provider.test.tsx`.
  - Existing session cache uses `@react-native-async-storage/async-storage` with injected storage for tests; Task 4 should follow that narrow adapter pattern outside `SessionCache`.

## Local Storage Implementation

- Added `lib/local-storage/current-list-selection.ts` and `lib/local-storage/index.ts`.
- Storage design:
  - One JSON `Record<string, string>` map per app `User.id`.
  - Map key is `householdId`; value is selected `listId`.
  - Invalid JSON or invalid map shape removes that User's selection key and returns `null`.
  - Empty persisted strings are treated as corrupt JSON, removed, and returned as no selection.
  - A small `createCurrentListSelectionStore({ storage })` factory keeps tests injected without exporting the storage key.
- Verification:
  - `pnpm exec jest --runInBand --runTestsByPath lib/local-storage/current-list-selection.test.ts` passed.

## Sign-Out Integration

- Extended `AuthenticatedAppSessionDisposal` with `signedOutUserId: string | null`.
- `createAuthenticatedAppSessionController().dispose()` captures `signedOutUserId` from the last ready/previous Authenticated App Session snapshot before publishing idle.
- Added sign-out dependency `clearCurrentListSelectionsForUser`, defaulting to `clearUserCurrentListSelections`.
- Preserved order: analytics track, analytics reset, controller dispose, signed-out session data cleanup, Current List selection cleanup for `signedOutUserId`, Clerk `signOut()`.
- Current List selection cleanup failures are logged with `authenticated app session sign-out current list selection cleanup failed`, and Clerk sign-out is still attempted.
- Updated sign-out order docs in `docs/how-things-work/authenticated-app-session.md` and `docs/how-things-work/analytics.md`.
- Verification:
  - `pnpm exec jest --runInBand --runTestsByPath components/session/authenticated-app-session-provider.test.tsx lib/services/session/controller.resource-lifecycle.test.ts` passed.

## Final Verification

- Focused storage + sign-out command:
  - `pnpm exec jest --runInBand --runTestsByPath lib/local-storage/current-list-selection.test.ts components/session/authenticated-app-session-provider.test.tsx lib/services/session/controller.resource-lifecycle.test.ts`
  - Result: passed, 3 suites, 46 tests.
- Final focused storage rerun after the empty-string corruption fix:
  - `pnpm exec jest --runInBand --runTestsByPath lib/local-storage/current-list-selection.test.ts`
  - Result: passed, 1 suite, 7 tests.
- Required typecheck:
  - `make typecheck`
  - Result: passed.
- Required full verification:
  - `make verify`
  - Result: passed. Includes `tsc --noEmit`, `biome ci .`, custom ESLint rule tests, `eslint .`, and `jest --runInBand`.
  - Jest result: 51 suites passed, 346 tests passed.

## Files Changed

- `lib/local-storage/current-list-selection.ts`
- `lib/local-storage/current-list-selection.test.ts`
- `lib/local-storage/index.ts`
- `lib/services/session/controller.ts`
- `lib/services/session/sign-out.ts`
- `components/session/authenticated-app-session-provider.tsx`
- `components/session/authenticated-app-session-provider.test.tsx`
- `lib/services/session/controller.resource-lifecycle.test.ts`
- `docs/how-things-work/authenticated-app-session.md`
- `docs/how-things-work/analytics.md`
- `docs/.local/features/list-creation-switching-mvp/tasks/4-local-current-list-selection/worker-notes.md`

## Handoff Notes

- No `state.json` changes were made.
- No List existence/archive/delete/fallback/zero-active behavior was added.
- No Home, resolver, ListService consumption, switching analytics, or Task 5 behavior was introduced.

# Testing

Tests are React Native-first. The default stack is Jest through `jest-expo` plus React Native Testing Library. Use Expo Router testing utilities for router and auth-gate flows when a test needs real route behavior.

There is no separate React DOM/jsdom track. Add one later only if the app grows web-specific behavior that cannot be exercised through the React Native surface.

Native end-to-end coverage uses Maestro. Add Maestro flows when behavior depends on a real iOS app runtime, native modules, app relaunch, device state, or offline/online transitions that Jest cannot prove.

## Commands

```bash
pnpm test
pnpm test:ci
pnpm test:coverage
pnpm typecheck
pnpm lint
```

- `pnpm test` runs Jest in watch mode for local development.
- `pnpm test:ci` runs Jest once with `--runInBand`; prefer this for verification because integration tests may create temp databases.
- `pnpm test:coverage` reports coverage but does not enforce a threshold.
- The standard proof for TS/TSX changes is `make verify`, which runs typecheck, Biome, Expo lint, and Jest when practical.
- Maestro flows run against an installed iOS build with the Maestro CLI or EAS Workflows. Add exact commands here when the first `.maestro/` flow and build profile are committed.

## Test Boundaries

Test our code, not external libraries.

Mock true external SDK and native boundaries:

- Clerk SDK hooks (`useAuth`, `useUser`, `useSignIn`, `useSignUp`, `useSSO`)
- Apple/Google/native auth modules
- PostHog and analytics/logging sinks
- Expo browser and secure storage APIs

Do not mock product behavior that can run locally. Database behavior should use an isolated local libSQL database loaded from checked-in migration SQL.

Use Maestro, not Jest, to prove native database module behavior such as Turso React Native open/sync, offline cold start, app relaunch, and airplane-mode transitions.

Maestro flows that are specifically about native database/offline behavior may use a test-only auth path gated to `APP_ENV=local` or `APP_ENV=test` plus explicit E2E flags/secrets on both client and server. The client may return a fake signed-in session, and the bootstrap API may accept a matching server-only bearer token that maps to a fixed test User profile. The bypass must fail closed in staging and production. Keep real Clerk email/password or OAuth automation in separate auth-focused smoke flows so database/offline tests are deterministic.

Database/offline Maestro flows should use a fixed E2E User profile and run an explicit local/test reset before the flow. Do not create a new Household DB per run unless the cleanup path is part of the test harness.

When a Maestro flow verifies offline writes that should sync later, pair the UI flow with a local/test-only post-flow assertion that queries the Household DB and confirms the offline Item reached the remote database.

MSW is intentionally not part of the first testing setup. Add MSW only when app-owned HTTP/API routes exist and tests need to exercise those network boundaries. Clerk is mocked at the SDK-hook boundary because feature code does not call Clerk HTTP endpoints directly.

## Database Tests

Database integration tests mirror production topology:

- one directory DB for Households, Members, and Invitations
- one Household DB per test Household for Lists, Items, and `item_checks`

The `test` environment means automated tests only. It is not a persistent cloud environment; staging is the persistent pre-production environment.

Use helpers from `db/test.ts`. They create temp local libSQL files and apply SQL from:

- `db/migrations/directory/*.sql`
- `db/migrations/household/*.sql`

Do not use `pnpm db:migrate` in tests. That command is for intentionally applying migrations to configured databases.

## File Layout

- `lib/test/setup.ts` configures global Jest setup and native/SDK mocks.
- `lib/test/mocks/` contains reusable mock modules and fixtures, including observability helpers such as analytics module mocks and logger injection fixtures.
- `db/test.ts` owns local temp DB helpers.
- Name tests `*.test.ts` or `*.test.tsx` so Jest does not mistake helper files such as `db/test.ts` for test suites.
- Screen flow tests live next to the screen they exercise, e.g. `screens/auth/sign-in-screen.test.tsx`.
- Non-route modules colocate tests next to source, e.g. `lib/redact.test.ts`.

Do not put test files in `app/`; Expo Router treats files there as routes or layouts.

## What Needs Tests

Prefer integration-style tests for product behavior:

- auth screens and auth-gate routing
- Household, Member, Owner, Invitation flows
- List and Item creation/edit/check/delete behavior
- sync/conflict-resolution behavior
- database migrations and repository/service logic
- analytics/logging calls when they are part of the feature contract

Prefer injected logger fixtures or narrow analytics test doubles for services and stores that accept observability dependencies. Reserve module mocks such as `@/lib/analytics` for UI and screen tests that import app-wide helpers directly.

Use focused unit tests for pure logic and narrow adapters:

- redaction
- Clerk error formatting
- typed event helpers
- deterministic ordering/merge helpers

Usually skip tests for:

- external library behavior
- React Native primitive rendering
- Expo starter scaffold that is not part of a real Household/List/Item workflow
- trivial style-only components unless they carry product behavior

## Coverage

Coverage is visible through `pnpm test:coverage`, but there is no global threshold yet. The current gate is policy-based: new or changed product behavior needs meaningful tests. Add scoped coverage thresholds later after the core Household/List/Item flows exist.

## Examples To Copy

- `lib/redact.test.ts` shows a focused pure-helper unit test.
- `db/migrations.test.ts` shows a local directory + Household DB integration test.
- `screens/auth/sign-in-screen.test.tsx` shows a React Native auth flow with Clerk and analytics mocked at module boundaries.

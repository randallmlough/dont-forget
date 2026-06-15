# Testing

Tests are React Native-first. The default stack is Jest through `jest-expo` plus React Native Testing Library. Use Expo Router testing utilities for router and auth-gate flows when a test needs real route behavior.

Integration-first testing is the hard default for product behavior. If Household, Member, Owner, Invitation, List, Item, Authenticated App Session, or sync behavior can run locally through Jest, React Native Testing Library, Expo Router testing utilities, and/or isolated temp libSQL databases, the test should exercise that real collaboration instead of replacing it with app-owned fakes.

There is no separate React DOM/jsdom track. Add one later only if the app grows web-specific behavior that cannot be exercised through the React Native surface.

Native end-to-end coverage uses Maestro. Add Maestro flows when behavior depends on a real iOS app runtime, native modules, app relaunch, device state, or offline/online transitions that Jest cannot prove.

For manual native QA, simulator debugging, and tool-specific guidance, see [QA and debugging workflow](../workflows/qa-and-debugging.md).

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
- NetInfo, app foreground/background state, timers, time, random ID sources, or deliberately controlled race collaborators when the behavior under test depends on deterministic ordering

Do not mock product behavior that can run locally. Database behavior should use an isolated local libSQL database loaded from checked-in migration SQL. Hand-written SQL result maps are not product coverage when the behavior can be seeded into temp libSQL.

Allowed mocks are defined by boundary, not convenience:

- External SDK/native/platform boundary: mock it.
- Network-only provider or observability sink: mock it or inject a narrow test double.
- Nondeterministic system input: control it only as far as the assertion requires.
- App-owned service/store/session/List/Item/sync policy: run it for product behavior.
- Race-control collaborator: fake only the timing edge being asserted and keep the rest of the path real when practical.

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

Use helpers from `db/server/test.ts`. They create temp local libSQL files and apply SQL from:

- `db/migrations/directory/*.sql`
- `db/migrations/household/*.sql`

Do not use `pnpm db:migrate` in tests. That command is for intentionally applying migrations to configured databases.

## Database Fixtures And Scenarios

`db/server/fixtures/` is the shared persistence fixture layer. It contains:

- low-level Drizzle insert-shaped builders for User, Household, Membership/Member, Invitation, Household Join Code, Household Join Code use/attempt, List, Item, and `item_checks` rows;
- scenario helpers that seed caller-provided directory and Household DB handles and return the inserted records/IDs.

`db/server/fixtures/` does not create `ListService`, `ItemService`, Authenticated App Session objects, providers, sync coordinators, or UI view models. Tests compose those runtime objects in the owning module's test helper after the database facts are seeded.

The first canonical scenario is `seedPrimaryHouseholdScenario`:

- Avery is the Owner.
- Blake is a Member.
- The Household is named `Avery`.
- The default List is named `Groceries`.
- Items cover unchecked, checked by Avery, checked by Blake, and tombstoned states.

Invitation service behavior is intentionally deferred until Invitation behavior exists. Directory fixture scenarios are available for focused persistence setup: multi-Household active User selection, Invitation lifecycle variants, and Household Join Code audit/use/attempt rows.

## Local Seed Commands

Local development seed data uses the same persisted fixture facts but is operationally separate from tests:

```bash
make db-seed
make db-reseed
make db-seed EMAIL=email@email.com
make db-reseed EMAIL=email@email.com
```

- `db-seed` runs `scripts/seed.ts`: local-only, seed-only, non-destructive, and fails if deterministic seed rows already exist in the no-`EMAIL` path. It assumes the deterministic seed Household DB already exists and has Household migrations applied.
- Without `EMAIL`, seed/reseed keep the deterministic DB-only seed behavior.
- With `EMAIL`, `db-seed` is additive: it creates an email-scoped seed Household without resetting unrelated local Users or Households. It creates two Clerk development Users: the supplied email as the Owner and the derived `+member` email as a plain Member. Both use password `testing1234`.
- `EMAIL` mode fails before creating new Clerk Users if either Clerk email already exists.
- `EMAIL` mode seeds 3 Members total: the Owner, the sign-inable plain Member, and Cameron as an app-only plain Member for Member-list UI coverage.
- `db-reseed` is the explicit local destructive rebuild path: reset local app data, migrate the directory DB, ensure the deterministic seed Household DB, then seed. It defaults to local and no longer requires `CONFIRM_DB_RESET`.
- `db-reset` still means reset to empty and remains confirmation-gated.
- Seed/reseed commands fail closed outside `APP_ENV=local`; staging and production are not seed sandboxes.

## File Layout

- `lib/test/setup.ts` configures global Jest setup and native/SDK mocks.
- `lib/test/mocks/` contains reusable mock modules and fixtures, including observability helpers such as analytics module mocks and logger injection fixtures.
- `db/server/test.ts` owns local temp DB helpers.
- Name tests `*.test.ts` or `*.test.tsx` so Jest does not mistake helper files such as `db/server/test.ts` for test suites.
- Screen flow tests live next to the screen they exercise, e.g. `screens/auth/sign-in-screen.test.tsx`.
- Non-route modules colocate tests next to source, e.g. `lib/redact.test.ts`.

Do not put test files in `app/`; Expo Router treats files there as routes or layouts.

## What Needs Tests

Use integration-style tests for product behavior:

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

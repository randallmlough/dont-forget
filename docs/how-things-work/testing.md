# Testing

Every workspace owns its Jest config and tests. `apps/mobile/` uses `jest-expo` plus React Native Testing Library and Expo Router testing utilities. `apps/api/`, `apps/web/`, `packages/shared/`, `packages/db/`, and `tooling/` use their package-owned Node Jest configs. The web track currently tests public-link policy and routing helpers in Node; it does not add a root or jsdom Jest track.

Integration-first testing is the hard default for product behavior. If Household, Member, Owner, Invitation, List, Item, Authenticated App Session, or sync behavior can run locally through Jest, React Native Testing Library, Expo Router testing utilities, and/or isolated ephemeral local databases, the test should exercise that real collaboration instead of replacing it with app-owned fakes.

Native end-to-end coverage uses Maestro. Add Maestro flows when behavior depends on a real iOS app runtime, native modules, app relaunch, device state, or offline/online transitions that Jest cannot prove.

For manual native QA, simulator debugging, and tool-specific guidance, see [QA and debugging workflow](../workflows/qa-and-debugging.md).

## Commands

```bash
make test
make test-ci
make test-coverage
make typecheck
make lint
```

- `make test` dispatches each workspace's Jest watch script through Turbo.
- `make test-ci` dispatches each workspace's Jest config once with `--runInBand`; prefer this for verification because integration tests may create temp databases.
- `make test-coverage` reports package-owned coverage but does not enforce a threshold.
- The standard proof for TS/TSX changes is `make verify`, which runs typecheck, Biome, Expo lint, and Jest when practical.
- Maestro flows run against an installed iOS build with the Maestro CLI or EAS Workflows. Add exact commands here when the first `.maestro/` flow and build profile are committed.

Select the owning workspace for a focused Jest run. Paths after `--filter` are package-relative:

```bash
pnpm --filter @dont-forget/mobile exec jest --runInBand --runTestsByPath ./src/session/bootstrap.test.ts
pnpm --filter @dont-forget/api exec jest --runInBand --runTestsByPath ./src/http.auth.test.ts
pnpm --filter @dont-forget/web exec jest --runInBand --runTestsByPath ./src/deep-link.test.ts
pnpm --filter @dont-forget/shared exec jest --runInBand --runTestsByPath ./src/redact.test.ts
pnpm --filter @dont-forget/db exec jest --runInBand --runTestsByPath ./src/migrations.test.ts
pnpm --filter @dont-forget/tooling exec jest --runInBand --runTestsByPath ./infra/compose.test.ts
```

## Test Boundaries

Test our code, not external libraries.

Mock true external SDK and native boundaries:

- Clerk SDK hooks (`useAuth`, `useUser`, `useSignIn`, `useSignUp`, `useSSO`)
- Apple/Google/native auth modules
- PostHog and analytics/logging sinks
- Expo browser and secure storage APIs
- NetInfo, app foreground/background state, timers, time, random ID sources, or deliberately controlled race collaborators when the behavior under test depends on deterministic ordering

Do not mock product behavior that can run locally. Database behavior should use an isolated local database loaded from checked-in migration SQL. Hand-written SQL result maps are not product coverage when the behavior can be seeded into a temp database.

Allowed mocks are defined by boundary, not convenience:

- External SDK/native/platform boundary: mock it.
- Network-only provider or observability sink: mock it or inject a narrow test double.
- Nondeterministic system input: control it only as far as the assertion requires.
- App-owned service/store/session/List/Item/sync policy: run it for product behavior.
- Race-control collaborator: fake only the timing edge being asserted and keep the rest of the path real when practical.

Use Maestro, not Jest, to prove native database module behavior such as PowerSync open/sync, offline cold start, app relaunch, and airplane-mode transitions.

Maestro flows that are specifically about native database/offline behavior may use a test-only auth path gated to `APP_ENV=local` or `APP_ENV=test` plus explicit E2E flags/secrets on both client and server. The client may return a fake signed-in session, and the bootstrap API may accept a matching server-only bearer token that maps to a fixed test User profile. The bypass must fail closed in staging and production. Keep real Clerk email/password or OAuth automation in separate auth-focused smoke flows so database/offline tests are deterministic.

Database/offline Maestro flows should use a fixed E2E User profile and run an explicit local/test reset before the flow. Do not create new test Households per run unless the cleanup path is part of the test harness.

When a Maestro flow verifies offline writes that should sync later, pair the UI flow with a local/test-only post-flow assertion that queries Postgres and confirms the offline Item synced to the server.

MSW is intentionally not part of the first testing setup. Add MSW only when app-owned HTTP/API routes exist and tests need to exercise those network boundaries. Clerk is mocked at the SDK-hook boundary because feature code does not call Clerk HTTP endpoints directly.

## Database Tests

Database integration tests mirror production topology:

- one Postgres database holding the directory (Users, Households, Members, Invitations) and product data (Lists, Items, `item_checks`), partitioned by `household_id`

The `test` environment means automated tests only. It is not a persistent cloud environment; staging is the persistent pre-production environment.

API and DB tests import helpers from `@dont-forget/db/test`, implemented in `packages/db/src/test.ts`. Those helpers run an ephemeral PGlite (embedded Postgres) database and apply the SQL in `packages/db/src/migrations/postgres/*.sql`. Mobile product-service tests (List/Item) use `apps/mobile/src/test/product-database.ts`, an in-memory SQLite database that mirrors the PowerSync client schema, so the real service SQL executes without the native PowerSync layer.

Do not use `make db-migrate` in tests. That command is for intentionally applying migrations to configured databases.

## Database Fixtures And Scenarios

`packages/db/src/fixtures/`, exported as `@dont-forget/db/fixtures`, is the shared persistence fixture layer. It contains:

- low-level Drizzle insert-shaped builders for User, Household, Membership/Member, Invitation, Household Join Code, Household Join Code use, List, Item, and `item_checks` rows;
- scenario helpers that seed caller-provided directory and product database handles and return the inserted records/IDs.

`packages/db/src/fixtures/` does not create `ListService`, `ItemService`, Authenticated App Session objects, providers, or UI view models. Tests compose those runtime objects in the owning module's test helper after the database facts are seeded.

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

- `db-seed` runs `packages/db/scripts/seed.ts`: local-only, seed-only, non-destructive, and fails if deterministic seed rows already exist in the no-`EMAIL` path. It assumes the local Postgres database already exists and has migrations applied.
- Without `EMAIL`, seed/reseed keep the deterministic DB-only seed behavior.
- With `EMAIL`, `db-seed` is additive: it creates an email-scoped seed Household without resetting unrelated local Users or Households. It creates or reuses two Clerk development Users: the supplied email as the Owner and the derived `+member` email as a plain Member. Both use password `testing1234`.
- Existing matching Clerk development Users are reused and repaired before the local duplicate seed-data check runs.
- `EMAIL` mode seeds 3 Members total: the Owner, the sign-inable plain Member, and Cameron as an app-only plain Member for Member-list UI coverage.
- `db-reseed` is the explicit local destructive rebuild path: reset local app data, migrate the Postgres database, then seed. It defaults to local and no longer requires `CONFIRM_DB_RESET`.
- `db-reset` still means reset to empty and remains confirmation-gated.
- The `db-seed` and `db-reseed` commands fail closed outside `APP_ENV=local`.

Staging has one additive, confirmation-gated exception for a purpose-created QA
Owner:

```bash
printf "Staging seed Owner email: "
IFS= read -r -s STAGING_SEED_EMAIL
printf "\n"
EMAIL="$STAGING_SEED_EMAIL" make infra-seed APP_ENV=staging
unset STAGING_SEED_EMAIL
```

This target runs the same package-owned seed entrypoint in a disposable
`tools`-profile container attached only to staging's private database network.
It accepts EMAIL-backed mode only, requires the exact staging confirmation,
and prints a safe cleanup manifest instead of emails, the shared seed password,
Household Join Code values, tokens, raw errors, or environment contents. The
persisted Household scenario is inserted in one transaction, so a later List
or Item failure rolls back every app row before newly-created Clerk Users are
cleaned up. Reused Clerk Users are never deleted.

The staging Compose service uses a blank default for an unset `EMAIL` so
inactive-profile interpolation does not disrupt normal staging commands. The
Make target rejects a blank value before Compose runs, and the source policy
also refuses the resulting deterministic mode in staging, so bypassing Make
cannot seed without an email.

This staging path does not reset or reseed the durable staging database and
does not deploy, restart, or destroy volumes. Automated `test` and production
always reject seeding, and production Compose has no seed service.

## File Layout

- `apps/mobile/src/test/setup.ts` configures mobile Jest setup and native/SDK mocks.
- `apps/mobile/src/test/mocks/` contains reusable mobile mock modules and fixtures, including observability helpers such as analytics module mocks and logger injection fixtures.
- `packages/db/src/test.ts` owns local temp DB helpers and is exported as `@dont-forget/db/test`.
- Name tests `*.test.ts` or `*.test.tsx` so Jest does not mistake helper files such as `packages/db/src/test.ts` for test suites.
- Screen flow tests live next to the screen they exercise, e.g. `apps/mobile/src/screens/auth/sign-in-screen.test.tsx`.
- Non-route modules colocate tests next to source, e.g. `packages/shared/src/redact.test.ts`.

Do not put test files in `apps/mobile/app/`; Expo Router treats files there as routes or layouts.

## What Needs Tests

Use integration-style tests for product behavior:

- auth screens and auth-gate routing
- Household, Member, Owner, Invitation flows
- List and Item creation/edit/check/delete behavior
- sync/conflict-resolution behavior
- database migrations and repository/service logic
- analytics/logging calls when they are part of the feature contract

Prefer injected logger fixtures or narrow analytics test doubles for services and stores that accept observability dependencies. Reserve module mocks such as `@mobile/lib/analytics` for UI and screen tests that import app-wide helpers directly.

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

Coverage is visible through `make test-coverage`, but there is no global threshold yet. The current gate is policy-based: new or changed product behavior needs meaningful tests. Add scoped coverage thresholds later after the core Household/List/Item flows exist.

## Examples To Copy

- `packages/shared/src/redact.test.ts` shows a focused pure-helper unit test.
- `packages/db/src/migrations.test.ts` shows a local Postgres migration integration test.
- `apps/mobile/src/screens/auth/sign-in-screen.test.tsx` shows a React Native auth flow with Clerk and analytics mocked at module boundaries.

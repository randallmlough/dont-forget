# Testing

Tests are React Native-first. The default stack is Jest through `jest-expo` plus React Native Testing Library. Use Expo Router testing utilities for router and auth-gate flows when a test needs real route behavior.

There is no separate React DOM/jsdom track. Add one later only if the app grows web-specific behavior that cannot be exercised through the React Native surface.

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
- The standard proof for TS/TSX changes is `pnpm typecheck`, `pnpm lint`, and `pnpm test:ci` when practical.

## Test Boundaries

Test our code, not external libraries.

Mock true external SDK and native boundaries:

- Clerk SDK hooks (`useAuth`, `useUser`, `useSignIn`, `useSignUp`, `useSSO`)
- Apple/Google/native auth modules
- PostHog and analytics/logging sinks
- Expo browser and secure storage APIs

Do not mock product behavior that can run locally. Database behavior should use an isolated local libSQL database loaded from checked-in migration SQL.

MSW is intentionally not part of the first testing setup. Add MSW only when app-owned HTTP/API routes exist and tests need to exercise those network boundaries. Clerk is mocked at the SDK-hook boundary because feature code does not call Clerk HTTP endpoints directly.

## Database Tests

Database integration tests mirror production topology:

- one directory DB for Households, Members, and Invitations
- one Household DB per test Household for Lists, Items, and `item_checks`

Use helpers from `test/db.ts`. They create temp local libSQL files and apply SQL from:

- `db/migrations/directory/*.sql`
- `db/migrations/household/*.sql`

Do not use `pnpm db:migrate` in tests. That command is for intentionally applying migrations to configured databases.

## File Layout

- `test/setup.ts` configures global Jest setup and native/SDK mocks.
- `test/db.ts` owns local temp DB helpers.
- `test/mocks/` contains reusable mock modules.
- `test/app/` contains route and screen flow tests for files under `app/`.
- Non-route modules can colocate tests next to source, e.g. `lib/redact.test.ts`.

Do not put test files in `app/`; Expo Router treats files there as routes or layouts.

## What Needs Tests

Prefer integration-style tests for product behavior:

- auth screens and auth-gate routing
- Household, Member, Owner, Invitation flows
- List and Item creation/edit/check/delete behavior
- sync/conflict-resolution behavior
- database migrations and repository/service logic
- analytics/logging calls when they are part of the feature contract

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
- `test/db/migrations.test.ts` shows a local directory + Household DB integration test.
- `test/app/sign-in.test.tsx` shows a React Native auth flow with Clerk and analytics mocked at module boundaries.

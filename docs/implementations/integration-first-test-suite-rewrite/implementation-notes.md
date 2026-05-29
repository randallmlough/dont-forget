# Integration-First Test Suite Rewrite Implementation Notes

Date: 2026-05-29

## Summary

This slice makes the repository teach the integration-first pattern in executable code:

- added a file-by-file test audit under `test-audit.md`;
- rebuilt `db/fixtures/` as persisted database facts only;
- moved Authenticated App Session payload/model fixtures into session-owned test helpers;
- added local-only seed and reseed commands;
- converted representative List, Item, session data service, and Home screen tests to use seeded temp libSQL where they prove product data paths;
- updated testing standards and workflows to make integration-first the hard default for product behavior and to define mocks by boundary.

## Fixture API

`db/fixtures/` now exports:

- `userFixture`
- `householdFixture`
- `membershipFixture` / `memberFixture`
- `invitationFixture`
- `listFixture`
- `itemFixture`
- `itemCheckFixture`
- `seedPrimaryHouseholdScenario`
- `PRIMARY_HOUSEHOLD_SEED`

The low-level builders return Drizzle insert-shaped rows with full caller overrides. Scenario helpers accept caller-provided directory and Household Drizzle DB handles, insert rows through Drizzle, and return the inserted records/IDs.

`db/fixtures/` intentionally does not return services, providers, sync coordinators, app sessions, or UI model objects. Session payload fixtures now live in `lib/services/session/test-fixtures.ts`.

## Canonical primary Household scenario

`seedPrimaryHouseholdScenario` seeds:

- Avery as Owner;
- Blake as Member;
- Household named `Avery`;
- default List named `Groceries`;
- Items for unchecked, checked by Avery, checked by Blake, and tombstoned states.

Invitation scenarios remain deferred until Invitation behavior exists; only the low-level Invitation row builder is included.

## Local seed commands

- `scripts/seed.ts` is local-only, seed-only, non-destructive, and fails when deterministic seed rows already exist.
- `make db-seed APP_ENV=local` runs seed-only against an existing migrated deterministic seed Household DB.
- `scripts/reseed.ts` is the explicit destructive local path and the first-setup path after an empty reset: reset known local app data, migrate the directory DB, ensure/migrate/reset the deterministic seed Household DB, then seed.
- `make db-reseed APP_ENV=local CONFIRM_DB_RESET=local` runs the destructive rebuild.
- `db-reset` still resets to empty.
- Seed/reseed refuse every environment except `local`.

## Tests converted in this slice

- `lib/services/session/services.test.ts`: List/Item reads and writes now use temp libSQL plus `seedPrimaryHouseholdScenario`; sync/open timing tests retain narrow store fakes.
- `screens/home/home-screen.test.tsx`: ready/default List/checked display/add/toggle paths now use a real session-shaped harness backed by seeded temp directory and Household DBs; retry/stale-load tests retain controlled fakes for failure/race assertions.
- `lib/services/item/item-service.test.ts`: retained temp libSQL coverage and adopted `db/fixtures` builders for persisted rows.
- `lib/services/list/list-service.test.ts`: retained temp libSQL coverage and adopted the primary scenario/builder fixtures.

## Commands run

- `pnpm test:ci -- lib/services/list/list-service.test.ts lib/services/item/item-service.test.ts lib/services/session/services.test.ts screens/home/home-screen.test.tsx`
- `pnpm typecheck`
- `pnpm test:ci -- lib/services/list/list-service.test.ts lib/services/item/item-service.test.ts lib/services/session/services.test.ts screens/home/home-screen.test.tsx lib/services/session/bootstrap.test.ts lib/services/session/cache.test.ts lib/services/session/controller.activation.test.ts lib/services/session/controller.cache-invalidation.test.ts lib/services/session/controller.resource-lifecycle.test.ts`
- `APP_ENV=staging pnpm db:seed` (expected refusal)
- `APP_ENV=staging CONFIRM_DB_RESET=staging pnpm db:reseed` (expected refusal)
- `pnpm biome:check`
- `pnpm lint`
- `pnpm test:eslint-rules`
- `pnpm test:ci`
- `git diff --check`
- audit completeness script (`rg --files -g '*.test.ts' -g '*.test.tsx' -g '*.test.js'` compared against `test-audit.md`; 39 files, 0 missing)
- `make verify`

Final verification passed with `make verify` (typecheck, Biome, ESLint rule tests, ESLint, and full Jest suite: 36 suites / 211 tests).

## Follow-ups

- Convert `components/auth/auth-gate.test.tsx` to a router/cache integration harness when the next auth-gate change touches that area.
- Opportunistically adopt `db/fixtures` builders in existing server service tests that still hand-build directory rows, without changing their test boundary.
- Revisit custom lint rules only after the new integration-first patterns settle; this rewrite intentionally defers lint enforcement.

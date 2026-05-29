# Integration Testing Seed Fixtures Discussion Notes

Date: 2026-05-29

This note captures decisions made while stress-testing a shift toward integration-first testing and shared database seed fixtures. It exists so another agent or a restarted session can continue without re-litigating settled points or drifting back toward over-mocked unit tests.

## Context

The codebase has had regressions that over-mocked unit tests did not catch. The desired direction is to discourage agents from defaulting to isolated unit tests when product behavior can be proven through an integration-style test.

Current repo state:

- `docs/how-things-work/testing.md` already says to prefer integration-style tests for product behavior and to avoid mocking local product behavior that can run deterministically.
- `docs/code-standards/testing.md` already says shared cross-feature test fixtures should move into a domain-owned shared fixture folder such as `db/fixtures/`.
- `db/test.ts` already creates isolated local libSQL files and applies checked-in directory and Household migrations.
- `db/fixtures/session.ts` contains app-session, List, and Item fixtures, but there is not yet a complete domain-shaped seed layer for Users, Households, Members, Lists, Items, `item_checks`, and Invitations across the directory DB plus Household DB topology.
- Several service tests already use temp libSQL databases, such as List and Item service tests.
- Other tests, especially controller, Home, and routing-oriented tests, still use many fakes and module mocks. Some of that is legitimate for external/native boundaries; some of it may be product behavior that should move closer to an integration boundary.

Related docs reviewed during this discussion:

- `CONTEXT.md`
- `docs/how-things-work/testing.md`
- `docs/code-standards/testing.md`
- `docs/workflows/feature-development.md`
- `docs/guides/adding-database-migration.md`

Related source reviewed during this discussion:

- `db/test.ts`
- `db/fixtures/session.ts`
- `db/schema/directory.ts`
- `db/schema/household.ts`
- `lib/services/item/item-service.test.ts`
- `lib/services/list/list-service.test.ts`

## Decisions Made

### 1. Make integration-first testing the hard default for product behavior

Product behavior should use integration-style tests whenever the behavior can run locally through Jest, React Native Testing Library, Expo Router testing utilities, and/or isolated temp libSQL databases.

This applies to Household, Member, Owner, Invitation, List, Item, Authenticated App Session, and sync behavior.

Rationale:

- Over-mocked unit tests have allowed product regressions because they proved fake collaborations between modules rather than the real local behavior.
- The repo already has temp libSQL helpers, migration-backed schema setup, and React Native-first test infrastructure that can exercise meaningful product paths without live external services.
- The domain model is cross-cutting by design; most useful assertions need to prove real boundaries collaborate correctly.

Rejected alternatives:

- **Keep integration tests as a preference only**: too weak for agent behavior; agents will keep choosing smaller mocked tests unless the default is explicit.
- **Ban unit tests entirely**: too broad; pure helpers, transition reducers, narrow adapters, and precise race-control logic still benefit from focused unit tests.

Implementation direction:

- Update testing standards and workflows to say integration-style tests are required by default for product behavior.
- Keep focused unit tests for pure helpers, reducers/transition helpers, narrow adapters, and race-control cases where full integration would make the assertion less precise.
- Treat mocks of local product behavior as something that requires justification.

### 2. Define legitimate mocks by boundary, not convenience

Mocks are legitimate when they stand in for true external SDKs, native/platform APIs, network-only providers, nondeterministic system inputs, observability sinks, or intentionally controlled race collaborators.

Mocks are disallowed by default when they replace app-owned product behavior that can run locally: domain services, repositories/stores, database query results, session resources, List/Item behavior, and sync policy.

Rationale:

- The failure mode is not "mocks exist"; the failure mode is mocks replacing the product collaboration that tests are supposed to prove.
- Boundary-based rules give agents a concrete decision test.
- Deterministic local infrastructure should be exercised directly instead of represented by hand-written fake return values.

Rejected alternatives:

- **Allow mocks wherever they keep tests small**: this is the existing path that lets fake behavior drift from production behavior.
- **Ban all mocks in integration tests**: too strict because Expo, Clerk, native modules, observability sinks, clocks, IDs, and race timing still need controlled boundaries.

Implementation direction:

- Document allowed mocks as boundary categories.
- Require explicit justification when a test mocks local product behavior.
- Treat mocked screen/session tests as acceptable for narrow display or routing states, not as proof of real Current List or Item behavior.

### 3. Split reusable DB fixtures from executable local seeding

`db/fixtures/` should be the source of truth for typed, domain-shaped fixture builders and scenarios. An executable seed command should live under `scripts/`, not `db/`, because it is an operational entrypoint rather than a schema/helper module.

The preferred executable location is:

```txt
scripts/seed.ts
```

Rationale:

- Test fixtures and local seeding need the same realistic domain facts, but tests should opt into explicit scenarios instead of depending on one global seeded database.
- `scripts/seed.ts` reads as an executable tool alongside other repo commands.
- Keeping the seed executable local-only avoids turning staging into a resettable seed sandbox and keeps production out of scope.

Rejected alternatives:

- **Put executable seed code in `db/seed.ts`**: too easy to confuse with database schema/migration/test helpers, while the intended use is a command.
- **Use one global test seed for all integration tests**: makes tests order-dependent and encourages broad setup instead of behavior-specific scenarios.
- **Allow staging/production seed commands**: conflicts with the environment model, where staging is durable and production is live data.

Implementation direction:

- Add reusable fixture builders/scenarios under `db/fixtures/`.
- Add `scripts/seed.ts` as a local-only executable that reuses those fixtures after reset/migration.
- Add Make/package commands only if the implementation slice includes the executable seed workflow.

### 4. Keep `db/fixtures/` focused on persisted database facts

`db/fixtures/` should own persisted database rows and scenario insert helpers, not app-session response objects or UI model fixtures.

The existing `db/fixtures/session.ts` is considered part of the old over-mocked pattern. It does not need to be preserved in place. Its useful facts can be moved into the new database fixture/scenario layer or into owning module test fixtures as needed.

Rationale:

- A folder named `db/fixtures/` should make integration tests easier to construct against the real directory DB plus Household DB topology.
- Mixing session payloads and UI/domain model objects into database fixtures encourages tests to bypass the real persisted shape.
- Keeping app-session fixtures near `lib/services/session/` makes their purpose explicit when narrow session/controller tests still need controlled shapes.

Rejected alternatives:

- **Keep app-session fixtures in `db/fixtures/` for convenience**: preserves the old pattern and muddies the fixture boundary.
- **Delete all non-DB fixtures without replacement**: too disruptive; session/controller tests may still need module-local helpers for precise state and race scenarios.

Implementation direction:

- Replace `db/fixtures/session.ts` with database-shaped fixture files/scenarios.
- Move app-session response fixtures to the owning session test helper area when still needed.
- Keep component-local view fixtures near the components that own those view models.

### 5. Use low-level builders plus scenario insert helpers

The fixture API should have two layers:

1. Low-level builders that create realistic database row objects with full caller customization.
2. Scenario helpers that insert coherent domain graphs into caller-provided test databases.

Low-level builders should support full overrides, for example:

```ts
userFixture({
  firstName: "John",
  email: "test@email.com",
});
```

Scenario helpers should cover repeated integration-test setup such as a primary Household, a two-Member Household, checked Items, and Invitations.

Rationale:

- Low-level builders keep unusual edge cases easy to construct without duplicating object literals.
- Full customization avoids fighting tests that need specific names, emails, timestamps, roles, deleted states, or relationship IDs.
- Scenario helpers keep ordinary integration tests readable and ensure directory DB plus Household DB facts stay coherent.

Rejected alternatives:

- **Only scenario helpers**: too rigid for edge cases and regression tests.
- **Only row builders**: leaves every test to hand-assemble cross-table relationships.

Implementation direction:

- Start with row builders for User, Household, Membership/Member, Invitation, List, Item, and `item_checks`.
- Add scenario helpers for the highest-repeat integration setup.
- Prefer scenarios in tests unless the test specifically needs malformed, missing, or edge-case rows.

### 6. Keep `db/fixtures/` at the persistence layer

`db/fixtures/` scenario helpers should seed caller-provided databases and return inserted records/IDs. They should not construct `ListService`, `ItemService`, `AuthenticatedAppSession`, React providers, sync coordinators, or other runtime/service objects.

Rationale:

- The fixture layer should make real database setup easy without becoming a hidden app runtime factory.
- Service/session/component integration harnesses can compose the real services they need from seeded DBs in their own owning modules.
- Keeping this boundary narrow makes it clearer when a test is proving persistence facts versus service/session behavior.

Rejected alternatives:

- **Return ready-to-use services from DB fixtures**: convenient at first, but it would couple persistence fixtures to application runtime composition and make test setup harder to reason about.

Implementation direction:

- Scenario helpers accept explicit directory DB and Household DB handles.
- Scenario helpers return seeded domain records and relationship IDs.
- Owning test helpers outside `db/fixtures/` compose services/providers from those seeded records when needed.

### 7. Rewrite the over-mocked product test suite now

Because the app has no users, the project should use this moment to rewrite the existing over-mocked product tests instead of only enforcing the new rule on future work.

Rationale:

- A greenfield/no-user state is the cheapest time to remove test architecture that has already allowed regressions.
- Leaving the old suite in place would keep teaching agents the wrong pattern, even if the docs say otherwise.
- A suite-wide migration makes the new fixture and integration-testing conventions real through examples, not just policy.

Rejected alternatives:

- **Only migrate touched tests**: too slow and leaves misleading examples throughout the repo.
- **Delete the old mocked tests without replacing coverage**: loses regression protection before the integration suite is ready.

Implementation direction:

- Audit existing tests into keep/convert/delete categories.
- Keep focused unit tests for pure helpers, transition helpers, narrow adapters, and precise race-control tests.
- Convert product-behavior tests that mock local app-owned behavior into integration-style tests.
- Delete redundant mocked tests once equivalent or stronger integration coverage exists.

### 8. Use keep/convert/delete audit categories with a coverage-preserving deletion bar

Every existing test file should be classified before migration:

- `keep`: pure helper tests, narrow adapter tests, migration/reset/client tests, and precise race-control tests that genuinely need fakes.
- `convert`: product behavior tests that mock app-owned services, stores, session resources, database results, or List/Item behavior.
- `delete`: mocked tests whose assertions are implementation details or fully subsumed by stronger integration coverage after conversion.

The deletion bar is strict: no product behavior coverage should be removed unless an integration-style test proves the same user/domain outcome through a more realistic path.

Rationale:

- The rewrite should improve signal without accidentally reducing regression coverage.
- Explicit categories make the migration reviewable and give future agents a repeatable test-audit method.
- Deleting implementation-detail tests is acceptable only after the behavior is covered at the right boundary.

Rejected alternatives:

- **Blindly convert every test**: wastes effort on tests that are already appropriately narrow.
- **Delete mocked tests based only on dislike of mocks**: risks losing coverage before the replacement is proven.

### 9. Use Jest/React Native integration harness levels; keep Maestro out of scope

The test rewrite should focus on Jest and React Native Testing Library integration coverage. Maestro/native end-to-end testing is out of scope for this effort.

Harness levels:

1. DB/service integration: temp libSQL plus real domain services for List, Item, Household, Member, Invitation, and server orchestration where practical.
2. Session/controller integration: real session resource composition where possible, with only external/native boundaries faked and races controlled deliberately.
3. Screen/provider integration: React Native Testing Library rendering providers/screens with real session/service harnesses backed by seeded DBs where practical.
4. Router integration: Expo Router testing utilities for route behavior when route behavior is the thing being proved.

The suite should prefer the lowest harness level that proves the real product collaboration.

Rationale:

- The current problem is over-mocked local product behavior in the Jest-level suite, not lack of full native end-to-end coverage.
- Excluding Maestro keeps this effort bounded to integration tests that run in normal CI/Jest workflows.
- Native e2e concerns such as relaunch, airplane mode, native Turso sync, and real device state can remain a separate future testing lane.

Rejected alternatives:

- **Include Maestro in the rewrite**: too broad for this effort; it changes the scope from integration-test architecture to end-to-end native QA.

### 10. Make the first implementation slice prove the pattern in code

The first implementation slice should include documentation updates, the new `db/fixtures/` API, cleanup of the legacy fixture shape, and representative test conversions.

Rationale:

- Docs alone will not stop agents from copying the old mocked patterns.
- A working fixture/scenario layer plus converted tests gives future work concrete examples.
- Converting representative tests immediately validates that the fixture API is usable rather than theoretical.

Rejected alternatives:

- **Docs-only first slice**: too weak; the repository would still teach the old pattern through existing tests.
- **Fixture API without conversions**: risks designing helpers that do not actually simplify integration tests.

Implementation direction:

- Update testing standards/workflow docs.
- Add database-shaped builders and scenario helpers under `db/fixtures/`.
- Move or remove legacy `db/fixtures/session.ts` usage.
- Convert a small representative set of tests in the same change, including service-level and screen/provider-level coverage.

### 11. Convert session services, Home screen paths, and existing List/Item service tests first

The first representative conversion set should target:

- `lib/services/session/services.test.ts`: convert List/Item data paths away from fake SQL result maps and toward temp libSQL seeded by `db/fixtures/`.
- `screens/home/home-screen.test.tsx`: convert ready/List/Item interaction paths away from mocked session services and toward a real session-shaped harness backed by seeded DB services.
- `lib/services/item/item-service.test.ts` and `lib/services/list/list-service.test.ts`: keep the existing temp-libSQL direction, but adopt the new fixture/scenario helpers.

`components/active-list/active-list.test.tsx` should not be part of the first conversion. It is mostly a presentational component contract with injected actions and deliberately controllable sync coordinator behavior.

Rationale:

- `services.test.ts` directly demonstrates the anti-pattern of faking SQL results for product data behavior.
- `home-screen.test.tsx` is the highest-value screen example because Home renders the Current List and routes Item interactions through the session services.
- Existing List/Item service tests already point in the right direction and can become exemplars for the new fixture API.

Rejected alternatives:

- **Start with `components/active-list/active-list.test.tsx`**: lower value for this migration because injected actions are appropriate for a presentational component boundary.

### 12. Use Drizzle for fixture writes

New database fixtures and seed helpers should use Drizzle ORM for database writes instead of handwritten SQL.

Rationale:

- Drizzle keeps fixture writes aligned with the schema types and database partition boundaries.
- Raw SQL in fixtures would duplicate schema knowledge and make future schema changes harder.
- The repo already uses Drizzle for schema definitions and service tests can insert rows with Drizzle against temp libSQL databases.

Implementation direction:

- Low-level fixture builders return Drizzle insert-shaped row objects.
- Scenario helpers insert through typed Drizzle DB handles.
- Raw SQL remains limited to existing migrations or genuinely necessary query behavior, not fixture setup.

### 13. Keep `scripts/seed.ts` seed-only, local-only, and non-destructive

`scripts/seed.ts` should seed data only. It should not reset or migrate databases.

Seed execution should require `APP_ENV=local`, assert that the target data is empty enough to avoid duplicate/conflicting rows, and fail with a clear message if the database must be reset first.

The intended operator sequence is:

```bash
make db-reset APP_ENV=local CONFIRM_DB_RESET=local
make db-migrate APP_ENV=local
make db-seed APP_ENV=local
```

For fast local iteration, use the explicit destructive `db-reseed` command described below instead of making `db-seed` destructive.

Rationale:

- Reset is destructive and should remain an explicit command with its existing confirmation.
- Migration is an operational schema step and should remain distinct from inserting development data.
- A seed-only command is easier to reason about and safer to rerun accidentally.

Rejected alternatives:

- **Reset/migrate/seed behind `db-seed`**: too much hidden destructive and operational behavior behind a command named seed.
- **Allow seed outside local**: conflicts with the environment model and risks treating staging as disposable.

### 14. Use a canonical primary Household scenario; defer Invitation scenarios

The default reusable seed scenario should represent a primary Household:

- User Avery as Owner.
- User Blake as Member.
- Household named `Avery`.
- One default List named `Groceries`.
- Items covering common states: unchecked, checked by Avery, checked by Blake, and tombstoned.

Invitation test scenarios can be deferred until Invitation behavior is implemented.

Rationale:

- This scenario covers the List, Item, Member, Owner, and checked-state display cases needed by the first integration-test rewrite.
- Avoiding Invitation fixtures for now keeps the first slice aligned with built behavior.
- Additional scenarios can layer on top later, such as empty List, two-Household User, Invitation acceptance, and deleted data.

Rejected alternatives:

- **Include Invitation variants immediately**: premature because Invitation behavior has not been built out yet.

### 15. Create a coverage-preserving test audit artifact before the suite rewrite

Before rewriting the whole suite, create a formal test audit artifact that lists every current test file as `keep`, `convert`, or `delete`.

For each test file, the audit must include:

- what behavior the tests currently prove;
- whether the file should be kept, converted, or deleted;
- the rationale for that classification;
- what integration-style test or retained focused test will preserve the behavior.

Rationale:

- The rewrite needs traceability so coverage is preserved even when the original test file context is not loaded.
- Capturing what each test is actually testing prevents accidental deletion of important behavior.
- A formal audit gives agents a reviewable checklist and stop condition for a whole-suite migration.

Implementation direction:

- Store the audit in the implementation notes for the rewrite or a dedicated `test-audit.md` under the implementation folder.
- Use the audit as the migration checklist.
- Update classifications if implementation reveals that a test is proving more or less than initially understood.

### 16. Document the rewrite under a dedicated implementation folder

The suite rewrite should be documented under:

```txt
docs/implementations/integration-first-test-suite-rewrite/
```

Expected artifacts:

- `test-audit.md`: file-by-file behavior summary, keep/convert/delete classification, rationale, and replacement/retained coverage.
- `implementation-notes.md` or the repo's established implementation-notes format: what changed, fixture API, tests converted/deleted, commands run, and known follow-ups.

Rationale:

- The rewrite is large enough to need durable proof and review context.
- Keeping the audit with implementation notes lets future agents understand why tests were rewritten or deleted.
- The folder gives the migration a clear stop condition.

### 17. Enforce the new rule through docs first, lint later

Future enforcement should start with documentation and workflow changes rather than a custom lint rule.

Update:

- `docs/code-standards/testing.md` with hard `Must` rules.
- `docs/how-things-work/testing.md` with the fixture/scenario model and mock boundaries.
- `docs/workflows/feature-development.md` with integration-first test planning.
- `docs/workflows/bug-fix.md` if bug-fix test guidance still allows too much unit-test defaulting.
- `AGENTS.md` only if a short high-salience reminder is needed for agents.

Defer a custom ESLint rule until the new suite patterns settle.

Rationale:

- Static enforcement of "over-mocked product behavior" is difficult and likely noisy before the desired patterns are established.
- Docs and converted tests will guide agents immediately.
- Lint can be revisited later for narrower, mechanically enforceable anti-patterns.

### 18. Add explicit destructive `db-reseed` for fast local rebuilds

Add a separate `db-reseed` command for fast local iteration.

Expected behavior:

```bash
make db-reseed APP_ENV=local CONFIRM_DB_RESET=local
```

`db-reseed` should reset local app data, migrate the directory DB, ensure the deterministic seed Household DB exists and is migrated, then insert the canonical seed data.

`db-reset` should keep meaning "reset to empty." `db-seed` should keep meaning "seed only." `db-reseed` is the explicit destructive rebuild-and-seed command.

Rationale:

- Fast local rebuilds are useful while the app has no users and integration fixtures are being built out.
- The destructive path should be available, but the command name should make the final state obvious.
- Keeping `db-reset`, `db-seed`, and `db-reseed` distinct preserves the existing safety model while avoiding slow manual command sequences.

Rejected alternatives:

- **Make `db-reset` also seed**: reset implies an empty database, while reseed implies a rebuilt database with development data.
- **Make `db-seed` destructive**: too surprising for a command named seed.

## Open Questions

None currently.

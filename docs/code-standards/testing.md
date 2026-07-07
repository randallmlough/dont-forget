# Testing

## Test Boundaries

- **Must** test app-owned behavior, not external SDK behavior.
- **Must** use integration-style tests as the default for product behavior that can run locally through Jest, React Native Testing Library, Expo Router testing utilities, or isolated ephemeral local databases.
- **Must** mock true external SDK and native boundaries such as Clerk hooks, native auth/browser/storage modules, PostHog sinks, and platform APIs.
- **Must** not mock local product behavior that can run deterministically in tests.
- **Must** justify any mock of local product behavior in the test or implementation notes; convenience is not a justification.
- **Must** use local isolated database helpers for database behavior instead of running migrations against configured environments.
- **Must** test loading, ready, empty, error, and retry states for route-owned data hooks or containers.
- **Must** test stale async responses, cancellation, or unmount cleanup when a hook or container owns async lifecycle.
- **Must** test authenticated app session provider cached load, fresh load, safe cached-to-fresh replacement, sign-out cleanup and recovery, stale run IDs, disposal, and write races through borrowed authenticated app session resources.
- **Must** test reducers and transition helpers directly when they encode product behavior or async UI recovery.
- **Must** cover success, failure, and ignored or no-op transitions where relevant.
- **Must** test user actions through visible behavior and accessibility queries, not implementation state.
- **Must** test Zod boundary failures for new schemas that protect runtime input.
- **Must** test diagnostic logging when the log is part of an error-handling contract.
- **Must** mock logging sinks in tests to avoid noisy expected error output.
- **Must** prefer injected logger fixtures or narrow analytics test doubles for services and stores over module-mocking app-wide observability singletons.
- **Must** make regression fakes fail for the broken ordering or race they are proving, not just pass for the fixed final outcome.
- **Must** prove Household, Member, Owner, Invitation, List, Item, Authenticated App Session, and sync product behavior through integration-style tests unless the behavior is pure logic, a narrow adapter, or a deliberately controlled race case.
- **Should** use focused unit tests for pure helpers and narrow adapters.
- **Should** mutate race-control fake state at the causal boundary under test, such as inside `subscribe()` when proving post-subscribe sampling.
- **Should** test state machines through their discriminated variants rather than boolean combinations.
- **Should** assert the resulting state shape rather than implementation details like action ordering.
- **Should** assert diagnostic log messages and safe context shape, not implementation details of the logger adapter.
- **Avoid** snapshot-only tests for components with meaningful behavior.
- **Avoid** relying only on component tests for complex reducer behavior.
- **Avoid** tests that make incidental debug or info logs brittle.

See also: [`docs/how-things-work/testing.md`](../how-things-work/testing.md).

## Mock Boundaries

- **Must** mock true external or nondeterministic boundaries by category: external SDKs, native/platform APIs, network-only providers, observability sinks, system time/randomness when needed, and intentionally controlled race collaborators.
- **Must** use real app-owned services, stores, database queries, session resources, List/Item behavior, and sync policy when they can run deterministically in the local harness.
- **Must** keep race-control fakes narrow: fake only the collaborator whose timing is the assertion, and keep the rest of the product path real when practical.
- **Avoid** replacing database rows or service results with hand-written maps when a temp local database plus fixtures can prove the same behavior.

## Test Location

- **Must** colocate tests next to the module they exercise outside `src/app/`.
- **Must** not put tests in `src/app/`; Expo Router treats files there as routes/layouts.
- **Should** keep reusable Jest setup and mock modules under `src/test`.

## Test Organization And Shared Fixtures

- **Must** move reusable cross-feature test fixtures into a domain-owned shared fixture folder, such as `src/server/db/fixtures/`, instead of duplicating fixture builders across test files.
- **Must** keep `src/server/db/fixtures/` limited to persisted database facts: Drizzle insert-shaped builders and scenario helpers that seed caller-provided directory and product databases.
- **Must** not return services, providers, app sessions, or UI model objects from `src/server/db/fixtures/`.
- **Should** keep shared fixtures domain-shaped and product-language-first: Household, Member, User, List, Item, and Invitation.
- **Should** allow narrow overrides for test-specific facts while preserving realistic defaults.
- **Should** split large test files by behavior theme when a single file starts covering several independent concerns.
- **Should** name focused test files after the behavior under test, for example `src/client/session/provider.activation.test.tsx`, `src/client/session/provider.sign-out.test.tsx`, or `src/client/session/provider.resource-lifecycle.test.tsx`.
- **Should** keep each focused test file readable as a behavior spec for one concern.
- **Avoid** extracting one-off setup into shared fixtures. Promote only fixtures used across multiple modules or likely to support future domain tests.
- **Avoid** hiding behavior in fixtures. Database fixtures should create rows, not encode product logic or runtime composition.
- **Avoid** giant catch-all test files where setup, assertions, and scenarios for unrelated behaviors are interleaved.
- **Avoid** splitting tests only to satisfy a line count. Split when the behavior themes are distinct enough that separate files improve navigation and review.

## Storybook

- **Must** add or update stories for reusable components and screen/view states that have meaningful visual states, fixture data, loading, error, or empty variants.
- **Must** run `make storybook-generate` after adding, moving, or deleting stories.
- **Should** keep stories deterministic with local fixture data and local state providers.
- **Avoid** requiring stories for tiny primitives, route entry files, or style-only internals with no meaningful states.

## Verification

- **Must** run the most focused useful test command while iterating.
- **Should** use `make verify` as the standard final proof for TS/TSX changes when practical.
- **Should** use Maestro for behavior that depends on a real iOS runtime, app relaunch, native modules, device state, or offline/online transitions.
- **Should** use the `rocketsim` CLI to validate UI changes in the iOS Simulator when visual behavior, accessibility, navigation, keyboard handling, or native runtime behavior matters.

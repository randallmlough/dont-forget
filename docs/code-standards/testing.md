# Testing

## Test Boundaries

- **Must** test app-owned behavior, not external SDK behavior.
- **Must** mock true external SDK and native boundaries such as Clerk hooks, native auth/browser/storage modules, PostHog sinks, and platform APIs.
- **Must** not mock local product behavior that can run deterministically in tests.
- **Must** use local isolated libSQL database helpers for database behavior instead of running migrations against configured environments.
- **Must** test loading, ready, empty, error, and retry states for route-owned data hooks or containers.
- **Must** test stale async responses, cancellation, or unmount cleanup when a hook or container owns async lifecycle.
- **Must** test reducers and transition helpers directly when they encode product behavior or async UI recovery.
- **Must** cover success, failure, and ignored or no-op transitions where relevant.
- **Must** test user actions through visible behavior and accessibility queries, not implementation state.
- **Must** test Zod boundary failures for new schemas that protect runtime input.
- **Must** test diagnostic logging when the log is part of an error-handling contract.
- **Must** mock logging sinks in tests to avoid noisy expected error output.
- **Must** prefer injected logger fixtures or narrow analytics test doubles for services and stores over module-mocking app-wide observability singletons.
- **Should** prefer integration-style tests for Household, Member, Owner, Invitation, List, Item, auth, analytics/logging contract, and sync behavior.
- **Should** use focused unit tests for pure helpers and narrow adapters.
- **Should** test state machines through their discriminated variants rather than boolean combinations.
- **Should** assert the resulting state shape rather than implementation details like action ordering.
- **Should** assert diagnostic log messages and safe context shape, not implementation details of the logger adapter.
- **Avoid** snapshot-only tests for components with meaningful behavior.
- **Avoid** relying only on component tests for complex reducer behavior.
- **Avoid** tests that make incidental debug or info logs brittle.

See also: [`docs/how-things-work/testing.md`](../how-things-work/testing.md).

## Test Location

- **Must** colocate tests next to the module they exercise outside `app/`.
- **Must** not put tests in `app/`; Expo Router treats files there as routes/layouts.
- **Should** keep reusable Jest setup and mock modules under `lib/test`.

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

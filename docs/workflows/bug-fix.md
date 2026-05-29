# Bug Fix Workflow

Use this playbook when behavior is broken, logs show an error, tests fail, or a regression is reported.

## Goal

Prove the bug, fix the root cause with the smallest safe change, and leave a regression signal that would catch the same failure again when practical.

## Reproduce First

1. Write the expected behavior and actual behavior.
2. Identify the smallest surface and state that triggers the bug.
3. Reproduce with the most direct tool:
   - Jest for deterministic logic or UI state;
   - RocketSim for iOS UI, keyboard, accessibility, native runtime, or simulator/device state;
   - logs/database inspection when the symptom is not fully visible.
4. Capture the exact failure evidence before changing code.

For native repros, follow the [QA and debugging workflow](./qa-and-debugging.md).

## Minimize

Before fixing, reduce the problem:

- Find the owning boundary: screen, component, service, store, coordinator, route, or database layer.
- Separate the triggering action from incidental setup.
- Identify whether the failure is user-visible, log-only, test-only, or data-integrity related.
- Check related post-mortems and tech-debt notes for known failure modes.

## Add a Regression Signal

Prefer a failing test before the fix when practical.

Good regression signals include:

- an integration-style Jest test for service, session, provider, screen, or database behavior;
- a focused unit test for pure logic, narrow adapters, or deliberately controlled race cases;
- a documented RocketSim repro when the behavior depends on native runtime state;
- a migration or database test for schema/data bugs.

For product regressions, default to an integration harness that uses real app-owned services and temp libSQL fixtures. Mock only true external/native boundaries or the single timing collaborator needed to reproduce a race.

If a test is not practical, document why and include the manual proof needed to verify the fix.

## Fix

1. Patch the smallest owner of the bug.
2. Avoid broad refactors unless the bug is caused by the boundary itself.
3. Preserve existing behavior outside the failing path.
4. Remove temporary debug logs and local artifacts before handoff.

## Verify

Run:

1. the regression test or focused check;
2. the original repro;
3. `make format`;
4. `make verify` when practical.

For log-driven bugs, verify both behavior and log output: the original error should be gone or intentionally downgraded to expected diagnostic noise.

## Post-Fix Documentation

Add or update docs only when the bug revealed lasting knowledge:

- `docs/post-mortem/` for significant regressions or incidents;
- `docs/tech-debt/` for known remaining gaps;
- `docs/how-things-work/` for clarified system behavior;
- `docs/code-standards/` for a new rule that should prevent recurrence.

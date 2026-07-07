# Feature Development Workflow

Use this playbook for new product behavior or meaningful changes to existing Household, List, Item, Member, Owner, User, or Invitation flows.

## Goal

Ship the smallest vertical slice that satisfies the requested behavior, with tests and reviewable verification evidence.

## Before Coding

1. Confirm the feature in product language from `CONTEXT.md`.
2. Read the relevant `docs/code-standards/` files.
3. Search `docs/adr/` and `docs/how-things-work/` for the owning system, and `docs/guides/` for artifact-specific recipes.
4. Identify the owner boundary:
   - route wiring in `src/app/`;
   - screen-owned behavior in `src/client/features/<feature>/`;
   - reusable UI primitives in `src/client/ui/`;
   - product data access in client feature services or server domain modules;
   - migrations and database helpers in `src/server/db/`.
5. Define the user-visible outcome and the verification plan.
6. Choose the lowest integration harness that proves the product collaboration:
   - temp local databases plus real services for database/service behavior;
   - session/provider integration for Authenticated App Session resource behavior;
   - React Native Testing Library screen/provider integration for visible List/Item behavior;
   - Expo Router utilities when route behavior is the thing being proved.
7. If a mock is needed, name the boundary category it replaces. Do not mock local product behavior for convenience.

## Implementation Loop

1. Add or update the most focused integration-style test first when product behavior can be proven in Jest.
2. Add or update Storybook stories for reusable UI or meaningful screen/view states.
3. Implement the smallest vertical slice through the owning boundary.
4. Keep route files thin and keep SQL/database access behind domain services.
5. Use domain-shaped names and avoid generic group/team/account/todo/task language.
6. Remove only unused code created by the change; do not opportunistically refactor adjacent code.

Use focused unit tests only for pure helpers, narrow adapters, or precise race-control cases where an integration harness would hide the assertion. For database-backed behavior, seed a temp local database with `src/server/db/fixtures/` builders/scenarios instead of mocking query results.

## Native UI Checks

Use simulator QA when the feature affects:

- navigation;
- keyboard behavior;
- accessibility roles, labels, or state;
- safe areas or scrolling;
- native modules;
- offline/online behavior;
- Current List or Item interactions that need real iOS proof.

Follow the [QA and debugging workflow](./qa-and-debugging.md) for RocketSim, cmux, Computer Use, logs, and evidence capture.

## Verification

While iterating, run the narrowest useful command, such as a focused Jest file or `make typecheck`.

Before handoff or PR:

```bash
make format
make verify
```

If `make verify` is impractical, record the reason and the strongest checks that did run.

## Documentation

Update docs when the feature changes lasting behavior or workflow:

- `docs/guides/` for concrete recipes that future features should repeat.
- `docs/how-things-work/` for implemented system behavior.
- `docs/code-standards/` for new enforceable rules.
- `docs/adr/` for architectural decisions.
- `docs/workflows/` for repeatable procedures.

Do not add docs for transient implementation details that are already obvious in code and tests.

## PR Evidence Checklist

Include:

- requested behavior and final behavior;
- tests and commands run;
- simulator evidence when native behavior matters;
- docs updated or a note that no lasting docs changed;
- known follow-ups, if any.

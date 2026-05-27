# Feature Development Workflow

Use this playbook for new product behavior or meaningful changes to existing Household, List, Item, Member, Owner, User, or Invitation flows.

## Goal

Ship the smallest vertical slice that satisfies the requested behavior, with tests and reviewable verification evidence.

## Before Coding

1. Confirm the feature in product language from `CONTEXT.md`.
2. Read the relevant `docs/code-standards/` files.
3. Search `docs/adr/` and `docs/how-things-work/` for the owning system.
4. Identify the owner boundary:
   - route wiring in `app/`;
   - screen-owned behavior in `screens/<surface>/`;
   - reusable UI in `components/`;
   - product data access in `lib/services/<domain>/`;
   - migrations and database helpers in `db/`.
5. Define the user-visible outcome and the verification plan.

## Implementation Loop

1. Add or update the most focused useful test first when behavior can be proven in Jest.
2. Add or update Storybook stories for reusable UI or meaningful screen/view states.
3. Implement the smallest vertical slice through the owning boundary.
4. Keep route files thin and keep SQL/database access behind domain services.
5. Use domain-shaped names and avoid generic group/team/account/todo/task language.
6. Remove only unused code created by the change; do not opportunistically refactor adjacent code.

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

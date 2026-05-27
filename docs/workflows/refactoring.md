# Refactoring Workflow

Use this playbook when changing structure without intending to change product behavior.

## Goal

Improve the code structure while preserving behavior, tests, and public contracts.

## Define the Refactor

Before editing, write:

- what is being moved, split, renamed, or simplified;
- what behavior must stay unchanged;
- which tests or simulator checks prove preservation;
- which docs, imports, or references will need updates.

If the change also alters user-visible behavior, use the [feature development workflow](./feature-development.md) or [bug fix workflow](./bug-fix.md) instead.

## Safety Rules

- Keep changes surgical and staged by seam.
- Prefer moving code before changing logic.
- Avoid opportunistic cleanup outside the stated refactor.
- Preserve domain language from `CONTEXT.md`.
- Preserve architecture boundaries from `docs/code-standards/architecture.md`.
- Do not introduce abstractions for a single current use unless the refactor removes real coupling.

## Recommended Sequence

1. Run the focused existing tests when practical to establish a baseline.
2. Move or rename one seam at a time.
3. Update imports and references immediately after each move.
4. Run a focused check after each risky step.
5. Simplify only after tests prove the move preserved behavior.
6. Update docs if the documented boundary or file location changed.

## Verification

Use checks that match the refactor:

- TypeScript for moves, renames, and public type changes.
- Focused Jest tests for behavior-preserving service, hook, or component refactors.
- Storybook generation when stories move.
- RocketSim when refactoring native UI structure could affect accessibility, keyboard, navigation, or safe-area behavior.

Before handoff:

```bash
make format
make verify
```

## Review Notes

In the PR or handoff, state:

- intended behavior change: none;
- files or boundaries moved;
- tests proving preservation;
- any follow-up cleanup intentionally left out.

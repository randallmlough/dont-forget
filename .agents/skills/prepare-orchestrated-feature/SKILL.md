---
name: prepare-orchestrated-feature
description: Use when creating or validating the local feature-prep scaffold for an orchestrator agent: docs/.local/features/<feature>/PRD.md, task folders, QA plans, implementation notes, state.json, dependency graph, completion evidence, and final handoff validation.
---

# Prepare Orchestrated Feature

Use this skill to create the prep work needed before an orchestrator starts implementation.

## Inputs

Require:

- Feature name or slug.
- Existing PRD path.

Prefer:

- Current branch name.
- Existing task folders, or a task list generated from a PRD/discussion.
- Source discussion path.

If no task folders exist yet, pass a task JSON file with `--tasks-file`. Only pass `--allow-empty` for an early skeleton that is not ready for orchestrated implementation.

## Target Shape

Create or verify:

```text
docs/.local/features/<feature-name>/PRD.md
docs/.local/features/<feature-name>/state.json
docs/.local/features/<feature-name>/implementation-notes.html
docs/.local/features/<feature-name>/tasks/<task-name>/task.md
docs/.local/features/<feature-name>/tasks/<task-name>/QA.md
docs/.local/features/<feature-name>/tasks/<task-name>/plan.md
docs/.local/features/<feature-name>/tasks/<task-name>/implementation-notes.html
```

## Workflow

1. Read `CONTEXT.md`, the PRD, and the source discussion.
2. Decide task boundaries as independently grabbable vertical slices.
3. Create or verify the feature folder under `docs/.local/features/<feature-name>/`.
4. Create task folders and required task artifacts.
5. Create feature-level `implementation-notes.html`.
6. Create schema v2 `state.json` with task order, dependencies, parallel groups, conflict areas, progress fields, review fields, verification fields, and structured `completionEvidence`.
7. Validate the scaffold with `scripts/validate_feature_state.mjs`; scaffold creation also runs this validation after writing.
8. Report the next ready task and any warnings.

## Scripts

Use the scripts when the filesystem shape or state ledger should be deterministic:

```bash
node .agents/skills/prepare-orchestrated-feature/scripts/create_feature_scaffold.mjs --feature "Feature Name" --slug feature-name --prd docs/.local/features/feature-name/PRD.md --tasks-file docs/.local/features/feature-name/tasks.json
node .agents/skills/prepare-orchestrated-feature/scripts/validate_feature_state.mjs docs/.local/features/feature-name
```

`create_feature_scaffold.mjs` is conservative. It creates missing files but does not overwrite existing files unless passed `--force`. It fails when no tasks are available unless `--allow-empty` is passed.

## Rules

- `state.json` is the machine-readable orchestration ledger.
- Human-readable task docs provide execution context; they are not the completion source of truth.
- Every task must have structured `completionEvidence` with stable IDs.
- Dependencies must reference real task IDs and must not form a cycle.
- Exactly one initial ready task is preferred unless parallel first tasks are intentional.
- Parallel waves must match task `parallelGroup` values and include every task exactly once.
- Do not mark tasks complete during prep.
- A completed task must include passing, not-applicable, or deferred-with-rationale evidence for each task completion gate.
- The PRD source document must exist; a provided discussion source should exist.
- Keep generated text concrete enough for handoff, but let the implementing worker update final evidence.

## References

Read `references/state-schema.md` when changing the state ledger shape.

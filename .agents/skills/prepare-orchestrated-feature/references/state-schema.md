# Orchestrated Feature State Schema

The state file lives at:

```text
docs/.local/features/<feature-name>/state.json
```

Required top-level keys:

- `schemaVersion`: currently `2`.
- `feature`: feature metadata, source docs, implementation notes path, progress, review, and verification.
- `orchestration`: allowed statuses, legal transitions, update rules, task completion gate, and feature completion gate.
- `parallelization`: ordered waves of task IDs.
- `tasks`: task ledger entries.

Source document rules:

- `feature.sourceDocuments.prd` is required and must point to an existing PRD.
- `feature.sourceDocuments.discussion` is optional, but if provided it should point to an existing discussion source.

Each task must include:

- `id`
- `name`
- `type`
- `status`
- `order`
- `parallelGroup`
- `canBeParallelized`
- `dependencies`
- `blocks`
- `touches`
- `conflictAreas`
- `recommendedReviewAgents`
- `paths.task`
- `paths.qa`
- `paths.plan`
- `paths.implementationNotes`
- `progress`
- `review`
- `verification`
- `completionEvidence`

Each `completionEvidence` item must include:

- `id`
- `description`
- `status`: `pending`, `passed`, `failed`, `not_applicable`, or `deferred`.
- `evidence`: array of structured proof entries.
- `notes`

Recommended evidence entry shapes:

```json
{
  "type": "test",
  "command": "pnpm test --runInBand path/to/test",
  "result": "passed",
  "recordedAt": "2026-06-05T00:00:00-0700",
  "notes": null
}
```

```json
{
  "type": "manual_qa",
  "scenario": "Open the List switcher from Home",
  "result": "passed",
  "recordedAt": "2026-06-05T00:00:00-0700",
  "notes": "Verified in iOS simulator."
}
```

Completion rule:

A task can move to `complete` only when every `completionEvidence` item is `passed`, `not_applicable`, or `deferred` with rationale, and review is approved or approved with follow-up.

Gate coverage rule:

When a task is `complete`, it must include one `completionEvidence` item for every `orchestration.taskCompletionGate[].id`. Each gate evidence item must be `passed`, `not_applicable`, or `deferred` with rationale in `notes`.

Parallelization rule:

Every task must appear in exactly one `parallelization.waves[].taskIds` entry. A wave's `parallelGroup` must match each included task's `parallelGroup`, and waves with multiple tasks should set `canRunInParallel` to `true`.

Empty scaffold rule:

An empty `tasks` array is only valid when validation is run with `--allow-empty`. Empty scaffolds are useful for early structure only; they are not ready for orchestrated implementation.

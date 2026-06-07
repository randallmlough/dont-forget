# Orchestrated Feature State Schema

The state file lives at:

```text
docs/.local/features/<feature-name>/state.json
```

Required top-level keys:

- `schemaVersion`: currently `3`.
- `feature`: feature metadata, source docs, markdown ledger/report paths, progress, review, and verification.
- `orchestration`: allowed statuses, legal transitions, update rules, task completion gate, and feature completion gate.
- `sequencing`: ordered task IDs with `mode: "sequential"`.
- `processEvents`: feature-level orchestration events.
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
- `dependencies`
- `blocks`
- `touches`
- `conflictAreas`
- `recommendedReviewAgents`
- `paths.state`
- `paths.task`
- `paths.qa`
- `paths.plan`
- `paths.workerNotes`
- `paths.reviewNotes`
- `paths.verificationNotes`
- `paths.report`
- `progress`
- `review`
- `verification`
- `agentLifecycle`
- `processEvents`
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

Sequential execution rule:

Every task must appear in `sequencing.taskIds` exactly once, and the order must match task `order`. `sequencing.mode` must be `sequential`. Parallel task execution is intentionally disabled.

Artifact rule:

Workers and reviewers write markdown ledgers:

- `worker-notes.md`
- `review-notes.md`
- `verification.md`

`report.html` is generated or refreshed by the orchestrator. Workers and reviewers should not hand-edit it.

Task-local state rule:

Each task folder includes a task-local `state.json`. The feature orchestrator owns the feature-level state file. A delegated task orchestrator owns only its task-local state and note files. Feature state stores roll-up status and dependency sequencing; task state stores detailed task lifecycle, review, verification, and agent lifecycle.

Legacy compatibility:

The validator still accepts schema v2 feature states that use `implementation-notes.html` and `parallelization`, but new scaffolds should use schema v3.

Empty scaffold rule:

An empty `tasks` array is only valid when validation is run with `--allow-empty`. Empty scaffolds are useful for early structure only; they are not ready for orchestrated implementation.

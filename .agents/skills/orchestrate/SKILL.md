---
name: orchestrate
description: Use when driving an orchestrated feature implementation from docs/.local/features/<feature>/state.json through Goal tracking, worker delegation, review, verification, and manager-only state updates. The orchestrator owns state.json; workers receive only their task-specific context and must not edit the state ledger.
---

# Orchestrate

Use this skill to manage a feature from an existing `docs/.local/features/<feature>/state.json` until the feature is complete or genuinely blocked.

## Operating Model

- The orchestrator is the only actor allowed to read and update `state.json`.
- Workers must be spawned with `fork_context: false` and only task-specific context.
- Workers must not read or edit `state.json`, other task folders, or feature-wide orchestration notes.
- The orchestrator owns task selection, status transitions, review routing, evidence recording, and final completion.
- Use the Codex Goal tool for the feature objective: create or resume one goal, check it after each task boundary, and mark it complete only after the state ledger validates and the feature is complete.
- The Goal tracks the orchestration objective; `state.json` remains the source of truth for feature and task progress.

## Inputs

Require:

- Feature state path, usually `docs/.local/features/<feature-name>/state.json`.

Read:

- `state.json` through `scripts/orchestrate_state.mjs inspect`.
- The selected task's `task.md`, `QA.md`, `plan.md`, and task-level `implementation-notes.html`.
- The repo source needed to verify the worker's changes.

Do not put full feature state, sibling task docs, or unrelated discussion material in worker prompts.

## Workflow

1. Inspect state:
   ```bash
   node .agents/skills/orchestrate/scripts/orchestrate_state.mjs docs/.local/features/<feature-name>/state.json inspect
   ```
2. Use the Goal tool:
   - If no goal exists, create one with the objective "Complete `<feature-name>` from `<state.json>` through orchestrated workers, review, and validation."
   - If a matching goal exists, continue it.
   - If an unrelated active goal exists, ask before replacing context.
   - Call `get_goal` after each worker result, review result, blocker, and state transition.
3. Select the lowest-order ready task from the inspect output unless the state file intentionally exposes safe parallel ready tasks.
4. Mark the task in progress with `start-task`.
5. Spawn a worker agent for that task with `fork_context: false`; use `references/worker-contract.md`.
6. Monitor the worker. When it returns, inspect its changed files, run relevant verification, and decide whether the task is ready for review.
7. Record machine-readable evidence with `record-evidence`.
8. Move the task through review:
   - `ready-for-review`
   - `start-review`
   - review agent(s) requested by the task
   - `changes-requested` or `approve-task`
9. If changes are requested, update state, send only those task-specific findings back to a worker, then repeat the review loop.
10. When every task completion gate has evidence and review is approved, run `complete-task`.
11. Repeat until no ready task remains.
12. When all tasks are complete, run feature-level review and verification, then `complete-feature`.
13. Validate state after every mutation. The script validates and restores the previous state if a mutation would leave the ledger invalid.

## State Commands

Use `scripts/orchestrate_state.mjs` for all ledger mutations:

```bash
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> start-task --task <task-id> --assigned-to <worker-id>
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> record-evidence --task <task-id> --evidence-id <gate-id> --status passed --type test --command "pnpm test"
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> ready-for-review --task <task-id>
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> start-review --task <task-id>
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> changes-requested --task <task-id> --finding "Finding text"
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> approve-task --task <task-id> --score 95
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> complete-task --task <task-id>
```

See `references/state-commands.md` for the full command list.

## Delegation Rules

- Spawn one worker per task unless parallelism is explicitly safe in `state.json`.
- Give workers task docs and narrow source references, not the whole feature plan.
- Tell workers they are not alone in the codebase and must not revert unrelated edits.
- Workers may update code, tests, stories, QA notes, and task-level implementation notes.
- Workers must report changed files, verification commands, manual QA, unresolved risks, and suggested evidence statuses.
- The orchestrator independently verifies before recording evidence or advancing status.

## Blockers

Set a task to `blocked` when the same blocker prevents useful progress after reasonable local investigation. Do not mark the Goal blocked until the same blocking condition has repeated for the required Goal-tool threshold and no meaningful progress remains.

## References

- `references/worker-contract.md`: worker prompt contract and allowed context.
- `references/state-commands.md`: state transition command reference.

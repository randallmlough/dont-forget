---
name: orchestrate
description: Use when driving an orchestrated feature implementation from docs/.local/features/<feature>/state.json through Goal tracking, sequential task delegation, review, verification, and manager-only state updates. The feature orchestrator owns feature state; task orchestrators own only task-local state and notes.
---

# Orchestrate

Use this skill to manage a feature from an existing `docs/.local/features/<feature>/state.json` until the feature is complete or genuinely blocked.

## Operating Model

- The feature orchestrator is the only actor allowed to read and update the feature-level `state.json`.
- A delegated task orchestrator may read and update only `tasks/<task-id>/state.json` and that task's note files.
- Workers must be spawned with `fork_context: false` and only task-specific context.
- Workers and reviewers must not read or edit feature `state.json`, other task folders, or feature-wide orchestration notes.
- The orchestrator owns task selection, status transitions, review routing, evidence recording, and final completion.
- Tasks run sequentially. Do not start parallel tasks or multiple workers for different tasks at the same time.
- Feature `state.json` is the roll-up and dependency source of truth. Task `state.json` is the delegated task contract.
- Use the Codex Goal tool for the feature objective: create or resume one goal, check it after each task boundary, and mark it complete only after the state ledger validates and the feature is complete.
- The Goal tracks the orchestration objective; `state.json` remains the source of truth for feature and task progress.

## Inputs

Require:

- Feature state path, usually `docs/.local/features/<feature-name>/state.json`.

Read:

- Feature `state.json` through `scripts/orchestrate_state.mjs inspect`.
- The selected task's `state.json`, `task.md`, `QA.md`, `plan.md`, `worker-notes.md`, `review-notes.md`, and `verification.md`.
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
3. Select the single lowest-order ready task from the inspect output. Do not run tasks in parallel.
4. Mark the task in progress with `start-task`.
5. Spawn a worker or task orchestrator for that task with `fork_context: false`; use `references/worker-contract.md`.
6. Monitor the worker. When it returns, copy useful evidence into the task notes and state, then close the worker thread unless immediate review fixes will be assigned to the same thread.
7. Inspect changed files, run relevant verification, and decide whether the task is ready for review.
8. Record machine-readable evidence with `record-evidence`.
9. Move the task through review:
   - `ready-for-review`
   - `start-review`
   - review agent(s) requested by the task
   - `changes-requested` or `approve-task`
10. After each review or re-review report, copy findings or approval into durable notes/state, then close the reviewer thread.
11. If changes are requested, update state, send only those task-specific findings back to a worker, then repeat the review loop.
12. When every task completion gate has evidence and review is approved, run `complete-task`.
13. Before starting the next task, close completed worker/reviewer threads from the current task.
14. Repeat until no ready task remains.
15. When all tasks are complete, run feature-level review and verification, then `complete-feature`.
16. Validate state after every mutation. The script validates and restores the previous state if a mutation would leave the ledger invalid.

## State Commands

Use `scripts/orchestrate_state.mjs` for all ledger mutations:

```bash
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> start-task --task <task-id> --assigned-to <worker-id>
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> record-event --task <task-id> --type worker_returned --notes "Worker report copied to worker-notes.md"
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> close-agent --task <task-id> --agent <agent-id> --reason "Report recorded"
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> record-evidence --task <task-id> --evidence-id <gate-id> --status passed --type test --command "pnpm test"
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> ready-for-review --task <task-id>
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> start-review --task <task-id>
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> changes-requested --task <task-id> --finding "Finding text"
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> approve-task --task <task-id> --score 95
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> complete-task --task <task-id>
```

See `references/state-commands.md` for the full command list.

## Delegation Rules

- Spawn one worker or task orchestrator per task. Do not run multiple task workers in parallel.
- Give workers task docs and narrow source references, not the whole feature plan.
- Tell workers they are not alone in the codebase and must not revert unrelated edits.
- Workers may update code, tests, stories, QA notes, and task-level markdown ledgers.
- Workers must report changed files, verification commands, manual QA, unresolved risks, suggested evidence statuses, and GitButler branch hygiene.
- The orchestrator independently verifies before recording evidence or advancing status.

## Artifact Rules

- `worker-notes.md`, `review-notes.md`, and `verification.md` are the human-written working ledgers.
- `report.html` is generated or refreshed by the orchestrator at task or feature completion; workers and reviewers must not hand-edit it.
- Feature state records roll-up status, dependency order, process events, and feature evidence.
- Task state records detailed task lifecycle, review status, verification status, and agent lifecycle.

## Agent Lifecycle

- Every worker or reviewer thread is task-scoped by default.
- After receiving a worker final report, copy useful evidence into task notes/state, then close the worker thread unless immediate review fixes will be assigned to the same thread.
- After receiving a code review report, copy findings into `review-notes.md` and the review ledger, then close the reviewer thread.
- After receiving a re-review approval, record approval evidence, then close the reviewer thread.
- Before starting the next sequential task, close all completed worker and reviewer threads from the current task.
- Do not leave completed agents open as passive context storage. Durable artifacts are the source of truth.
- If an agent must stay open, record why with `record-event` and revisit before launching another agent.

## Architecture And Complexity Gates

Run a short architecture review after the first foundation task and before later tasks depend on it. Settle state ownership, async lifecycle, storage cleanup, and operation runner boundaries before continuing.

Before marking a task ready for review, verify:

- No new all-in-one hook, controller, or component owns multiple workflows without justification.
- Repeated begin/finish/stale/sync/error handling is centralized.
- Async work is tied to session/resource lifetime where relevant.
- Storage rollback and cleanup semantics preserve unrelated data.
- Task-owned files are assigned to the intended GitButler branch and no task-owned changes remain unassigned.

## Blockers

Set a task to `blocked` when the same blocker prevents useful progress after reasonable local investigation. Do not mark the Goal blocked until the same blocking condition has repeated for the required Goal-tool threshold and no meaningful progress remains.

## References

- `references/worker-contract.md`: worker prompt contract and allowed context.
- `references/state-commands.md`: state transition command reference.

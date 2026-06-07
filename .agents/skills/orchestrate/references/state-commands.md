# Orchestrator State Commands

Run all commands from the repo root:

```bash
node .agents/skills/orchestrate/scripts/orchestrate_state.mjs <state.json> <command> [options]
```

Add `--dry-run` to preview a mutation without writing.

## Inspect

```bash
inspect
```

Prints feature status, the single next ready task, and task counts. Orchestration is sequential; if multiple tasks are technically dependency-ready, the lowest-order incomplete task is the only task that should be started.

## Task Lifecycle

```bash
start-task --task <task-id> --assigned-to <worker-id>
block-task --task <task-id> --reason "<reason>"
unblock-task --task <task-id>
ready-for-review --task <task-id>
start-review --task <task-id> [--agent <reviewer-id>]
changes-requested --task <task-id> --finding "<finding>" [--finding-id <id>] [--agent <reviewer>]
start-review-fixes --task <task-id> --assigned-to <worker-id>
resolve-finding --task <task-id> --finding-id <id> --resolution "<resolution>" [--status resolved|deferred]
approve-task --task <task-id> [--score <number>] [--with-follow-up] [--allow-open-findings]
complete-task --task <task-id>
```

`complete-task` requires:

- task status `approved`
- task review status `approved` or `approved_with_follow_up`
- no unresolved review findings
- every task completion gate has evidence status `passed`, `not_applicable`, or `deferred`
- deferred evidence has rationale in `notes`

## Evidence

```bash
record-evidence --task <task-id> --evidence-id <gate-id> --status passed --type test --command "<command>" --result passed --notes "<notes>"
record-evidence --task <task-id> --evidence-id <gate-id> --status not_applicable --notes "<rationale>"
record-evidence --task <task-id> --evidence-id <gate-id> --status deferred --notes "<rationale>"
```

Evidence status must be one of the values listed in `state.orchestration.evidenceStatusValues`.

## Process Events And Agents

```bash
record-event --type reviewer_usage_limit --notes "<notes>"
record-event --task <task-id> --type worker_returned --agent <agent-id> --notes "<notes>"
record-event --task <task-id> --type hitl_unavailable --command "xcrun simctl list devices booted" --result failed --notes "<notes>"
close-agent --task <task-id> --agent <agent-id> --reason "Report recorded"
```

Use `record-event` for orchestration process facts that should survive thread compaction: reviewer/tool failure, manager intervention, HITL infrastructure unavailable, GitButler parser/dependency-lock issue, agent-cap pressure, and completed agents closed by the orchestrator.

Use `close-agent` after worker and reviewer reports have been copied into durable task artifacts. It removes the agent from task-local open agent tracking and records a close event.

## Task Result Import

```bash
import-task-result --task <task-id>
```

Imports compact status, review, verification, and agent lifecycle fields from `tasks/<task-id>/state.json` into the feature roll-up task entry. The feature orchestrator remains responsible for review/evidence gates and final completion.

## Feature Lifecycle

```bash
request-feature-review
start-feature-review
record-feature-evidence --status passed --type test --command "<command>" --result passed
approve-feature [--score <number>] [--with-follow-up]
complete-feature
```

`complete-feature` requires all tasks complete and feature review approved or approved with follow-up.

# Worker Contract

Use this contract when spawning a worker for one orchestrated task.

## Spawn Settings

- `agent_type`: `worker`
- `fork_context`: `false`
- Prompt includes only the selected task's docs and narrow repo instructions.

## Allowed Worker Context

Give the worker:

- Task-local state path: `docs/.local/features/<feature>/tasks/<task>/state.json`
- Task path: `docs/.local/features/<feature>/tasks/<task>/task.md`
- QA path: `docs/.local/features/<feature>/tasks/<task>/QA.md`
- Plan path: `docs/.local/features/<feature>/tasks/<task>/plan.md`
- Worker notes path: `docs/.local/features/<feature>/tasks/<task>/worker-notes.md`
- Review notes path: `docs/.local/features/<feature>/tasks/<task>/review-notes.md`
- Verification notes path: `docs/.local/features/<feature>/tasks/<task>/verification.md`
- Narrow source files or search targets needed for the task.
- Relevant review findings for this same task when doing review fixes.

Do not give the worker:

- Feature-level `state.json`
- Feature-level implementation notes
- Other task folders
- Full discussion exports
- Full PRD unless the task docs are insufficient; if needed, provide a small task-relevant excerpt.

## Required Worker Instructions

Include these instructions in every worker prompt:

```text
You are implementing exactly one orchestrated task.

You are not alone in the codebase. Do not revert or overwrite unrelated edits. Adjust to concurrent changes if you encounter them.

Do not read or edit the feature-level state.json. The feature orchestrator owns the feature ledger.

Read only this task's task-local state.json, task.md, QA.md, plan.md, worker-notes.md, review-notes.md, verification.md, and the repo source needed to complete this task.

Append useful progress and decisions to worker-notes.md. Do not edit report.html.

Before reporting ready for review, answer these lifecycle questions in worker-notes.md:
- What happens if the session/resource changes while this operation is in flight?
- What happens if the target entity is archived/deleted/stale between read and write?
- What happens if two operations complete out of order?
- Can a stale async result persist data, emit analytics, or update visible state?
- Does rollback preserve unrelated data?
- Are repeated workflow branches centralized instead of duplicated?

Before reporting ready for review, run GitButler status and report whether task-owned files remain unassigned.

When finished, report:
- changed files
- acceptance criteria status
- verification commands and results
- manual QA performed or still needed
- storybook/simulator coverage where relevant
- unresolved risks or blockers
- GitButler branch/status hygiene
- suggested completionEvidence updates by evidence id
```

## Worker Done Signal

A worker is done only when it returns a final report that lets the orchestrator decide each task completion gate. A worker cannot mark the task complete; it can only recommend evidence updates.

After the orchestrator copies the final report into durable task artifacts, the worker thread should be closed unless the orchestrator immediately assigns review fixes to the same thread.

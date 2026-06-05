# Worker Contract

Use this contract when spawning a worker for one orchestrated task.

## Spawn Settings

- `agent_type`: `worker`
- `fork_context`: `false`
- Prompt includes only the selected task's docs and narrow repo instructions.

## Allowed Worker Context

Give the worker:

- Task path: `docs/.local/features/<feature>/tasks/<task>/task.md`
- QA path: `docs/.local/features/<feature>/tasks/<task>/QA.md`
- Plan path: `docs/.local/features/<feature>/tasks/<task>/plan.md`
- Implementation notes path: `docs/.local/features/<feature>/tasks/<task>/implementation-notes.html`
- Narrow source files or search targets needed for the task.
- Relevant review findings for this same task when doing review fixes.

Do not give the worker:

- `state.json`
- Feature-level implementation notes
- Other task folders
- Full discussion exports
- Full PRD unless the task docs are insufficient; if needed, provide a small task-relevant excerpt.

## Required Worker Instructions

Include these instructions in every worker prompt:

```text
You are implementing exactly one orchestrated task.

You are not alone in the codebase. Do not revert or overwrite unrelated edits. Adjust to concurrent changes if you encounter them.

Do not read or edit state.json. The orchestrator owns the state ledger.

Read only this task's task.md, QA.md, plan.md, task-level implementation-notes.html, and the repo source needed to complete this task.

Update the task-level implementation-notes.html Worker section as you progress.

When finished, report:
- changed files
- acceptance criteria status
- verification commands and results
- manual QA performed or still needed
- storybook/simulator coverage where relevant
- unresolved risks or blockers
- suggested completionEvidence updates by evidence id
```

## Worker Done Signal

A worker is done only when it returns a final report that lets the orchestrator decide each task completion gate. A worker cannot mark the task complete; it can only recommend evidence updates.

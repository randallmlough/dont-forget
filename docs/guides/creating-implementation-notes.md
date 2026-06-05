# Creating Implementation Notes

## Purpose

Use this guide to create implementation notes for a non-trivial change.

Implementation notes are a live coordination artifact while work is in progress and durable proof after work is complete. They should let an orchestrating agent understand the task, see worker progress, delegate review, confirm requested changes were addressed, and move to another task with confidence. They are not the place for reusable how-to recipes or implemented system explanations.

## Before you start

Read:

- `CONTEXT.md` for domain language.
- `docs/workflows/documentation.md` for docs taxonomy.
- The workflow used for the work, such as `docs/workflows/feature-development.md`, `docs/workflows/refactoring.md`, or `docs/workflows/bug-fix.md`.
- Any related ADR or how-things-work document.

Inspect current local feature notes before creating a new one:

- `docs/.local/features/<feature-name>/implementation-notes.html`
- `docs/.local/features/<feature-name>/tasks/<sub-task-name>/implementation-notes.html`

## Files and naming

Create `implementation-notes.html` under the local feature directory or under a specific task directory:

```text
docs/.local/features/<feature-name>/implementation-notes.html
docs/.local/features/<feature-name>/tasks/<sub-task-name>/implementation-notes.html
```

Use the feature-level path when the notes coordinate or summarize the whole feature:

```text
docs/.local/features/list-creation-switching/implementation-notes.html
```

Use the nested task-level path when the notes belong to one independently-grabbable sub-task:

```text
docs/.local/features/list-creation-switching/tasks/archive-and-restore-lists/implementation-notes.html
```

Current implementation notes use HTML. Keep that format unless the repository intentionally changes the convention.

## Template

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Implementation Notes: Title Case Summary</title>
  </head>
  <body>
    <h1>Implementation Notes: Title Case Summary</h1>

    <section>
      <h2>Overview</h2>
      <p>Short summary of the task, the intended user or system outcome, and the scope of the change.</p>

      <h3>Setup</h3>
      <dl>
        <dt>Task</dt>
        <dd>Issue, PRD task, or short task name.</dd>

        <dt>Branch</dt>
        <dd><code>branch-name</code></dd>

        <dt>Started At</dt>
        <dd>YYYY-MM-DD HH:MM TZ</dd>

        <dt>Source Material</dt>
        <dd>Links to the issue, PRD, discussion, ADR, task plan, or related docs.</dd>

        <dt>Primary Files</dt>
        <dd>Files or modules expected to own the change.</dd>
      </dl>
    </section>

    <section>
      <h2>Worker</h2>

      <h3>Status</h3>
      <p>Not started | In progress | Blocked | Ready for review | Review fixes in progress | Complete</p>

      <h3>What Currently Exists</h3>
      <p>Brief baseline of the existing behavior, code paths, docs, tests, or gaps before implementation.</p>

      <h3>Implementation Progress</h3>
      <ul>
        <li>Progress entry with date/time, changed area, and current result.</li>
      </ul>

      <h3>Design Decisions</h3>
      <ul>
        <li>Decision and rationale.</li>
      </ul>

      <h3>Deviations From Spec</h3>
      <p>None.</p>

      <h3>Tradeoffs Considered</h3>
      <ul>
        <li>Tradeoff and why this direction was chosen.</li>
      </ul>

      <h3>Open Questions</h3>
      <p>None.</p>

      <h3>Verification</h3>
      <ul>
        <li><code>make format</code> passed.</li>
        <li><code>make verify</code> passed.</li>
      </ul>
    </section>

    <section>
      <h2>Reviewers</h2>

      <h3>Status</h3>
      <p>Not requested | In progress | Changes requested | Approved | Approved with follow-up</p>

      <h3>Code Review Agents Requested</h3>
      <ul>
        <li><code>code-review</code></li>
      </ul>

      <h3>Score</h3>
      <p>Overall implementation score and short rationale.</p>

      <h3>Findings</h3>
      <ul>
        <li>Finding, severity, owner, and resolution status.</li>
      </ul>

      <h3>Decisions</h3>
      <ul>
        <li>Reviewer decision, required change, or accepted follow-up.</li>
      </ul>
    </section>

    <section>
      <h2>Post Implementation Checklist</h2>
      <ul>
        <li>Does this task meet the applicable docs in <code>docs/code-standards/</code>?</li>
        <li>Does the implementation match the requested scope without speculative behavior?</li>
        <li>Have all requested review changes been addressed or explicitly deferred with rationale?</li>
        <li>Are tests, linting, formatting, and relevant focused checks passing?</li>
        <li>Were expected failures, skipped checks, or unverified areas recorded honestly?</li>
        <li>Were related durable docs updated when the implemented behavior changed lasting guidance?</li>
        <li>Is the final worker status <code>Complete</code> and reviewer status <code>Approved</code> or <code>Approved with follow-up</code>?</li>
      </ul>
    </section>
  </body>
</html>
```

Keep all top-level sections in place so orchestrating agents have a stable document shape. Within a section, replace placeholder text with concise evidence as soon as it exists. Do not leave boilerplate that says nothing in completed notes.

## Recipe

1. **Decide whether notes are warranted.**
   - Create notes for non-trivial changes, architecture-sensitive work, behavior that future agents will need to understand, or work with meaningful deviations/tradeoffs.
   - Do not create notes for tiny obvious edits where code/tests are enough.

2. **Choose the slug.**
   - Use the existing `<feature-name>` directory when the feature already has a PRD or tasks under `docs/.local/features/`.
   - Use `<sub-task-name>` for task-level notes and keep it aligned with the task directory name.
   - Keep feature and task slugs stable, lowercase, and hyphenated.

3. **Fill out Overview and Setup before implementation.**
   - Record the branch, task source, source material, and expected owning files.
   - Keep this factual so another agent can resume the work without reconstructing context.

4. **Record current behavior, not a wish list.**
   - `What Currently Exists` should describe the baseline before implementation.
   - Progress entries should describe what was implemented and verified.
   - Future work belongs in Open Questions, tech debt, or issue tracker notes.

5. **Keep Worker status current.**
   - Use the Worker section while implementation is active.
   - Update status before handing work to reviewers or stopping because of a blocker.

6. **List design decisions.**
   - Name owning files or boundaries when that helps future readers.
   - Use Household, Member, Owner, User, List, Item, Invitation, Home, Current List, and Household Session language.

7. **Record deviations from the plan or spec.**
   - If none, say `None.`
   - If work changed course, explain why and cite the concrete file or test that forced the change.

8. **Record tradeoffs considered.**
   - Keep these concise.
   - Do not duplicate ADR-level decisions; link to the ADR instead.

9. **Record verification evidence.**
   - Include focused commands and final gates.
   - Include expected failures only when they were part of a test-first proof.
   - Include simulator/RocketSim proof when native behavior mattered.

10. **Use Reviewers as the review handoff.**
   - Record which review agents were requested.
   - Capture score, findings, decisions, and whether requested changes were addressed.
   - Do not overwrite reviewer findings; append resolution notes so the review trail stays auditable.

11. **Complete the post implementation checklist last.**
   - Treat the checklist as the final confidence gate before moving on.
   - Leave an explicit note for any unchecked item and why it is acceptable.

12. **Update related docs only if lasting guidance changed.**
   - Use `docs/how-things-work/` for implemented system explanations.
   - Use `docs/guides/` for reusable artifact recipes.
   - Use `docs/code-standards/` for enforceable rules.
   - Use `docs/adr/` for new architectural decisions.

## Tests and verification

For docs-only implementation-note changes:

```bash
make format
make verify
```

If `make verify` is not practical, run `make format` and the strongest relevant focused checks. Also search for stale references when paths or docs moved:

```bash
rg "<old-path>|<new-path>|implementation-notes.html" docs AGENTS.md
```

## Review checklist

- File path is either `docs/.local/features/<feature-name>/implementation-notes.html` or `docs/.local/features/<feature-name>/tasks/<sub-task-name>/implementation-notes.html`.
- Overview and Setup identify the task, branch, source material, and expected owning files.
- Worker status, baseline, progress, decisions, deviations, tradeoffs, open questions, and verification are current.
- Reviewer status, requested agents, score, findings, and decisions are recorded when review has happened.
- Post Implementation Checklist is completed or explicitly annotated.
- Notes explain completed work and current task state, not speculative plans.
- Design decisions, deviations, tradeoffs, open questions, and verification are accurate.
- Domain language matches `CONTEXT.md`.
- Related durable guidance was updated in the right docs directory when needed.
- Commands and test results are recorded honestly.

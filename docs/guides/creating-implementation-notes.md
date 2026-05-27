# Creating Implementation Notes

## Purpose

Use this guide to create implementation notes after a completed non-trivial change.

Implementation notes preserve durable proof of what changed, why tradeoffs were made, deviations from the plan, verification evidence, and follow-up questions. They are not the place for reusable how-to recipes or implemented system explanations.

## Before you start

Read:

- `CONTEXT.md` for domain language.
- `docs/workflows/documentation.md` for docs taxonomy.
- The workflow used for the work, such as `docs/workflows/feature-development.md`, `docs/workflows/refactoring.md`, or `docs/workflows/bug-fix.md`.
- Any related ADR or how-things-work document.

Inspect current notes before creating a new one:

- `docs/implementations/46-move-current-list-data-source-into-household-services/implementation-notes.html`
- `docs/implementations/service-refactor-review-fixes/implementation-notes.html`
- `docs/implementations/network-aware-household-sync-retry/implementation-notes.html`

## Files and naming

Create a directory under `docs/implementations/` and add `implementation-notes.html`:

```text
docs/implementations/<issue-or-topic-slug>/implementation-notes.html
```

Use an issue-number slug when the work is tied to a numbered issue:

```text
docs/implementations/46-move-current-list-data-source-into-household-services/implementation-notes.html
```

Use a short topic slug when there is no issue number:

```text
docs/implementations/service-refactor-review-fixes/implementation-notes.html
```

Current implementation notes use HTML. Keep that format unless the repository intentionally changes the convention.

## Minimal template

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Implementation Notes: Title Case Summary</title>
  </head>
  <body>
    <h1>Implementation Notes: Title Case Summary</h1>

    <h2>Design Decisions</h2>
    <ul>
      <li>Decision and rationale.</li>
    </ul>

    <h2>Deviations From Spec</h2>
    <p>None.</p>

    <h2>Tradeoffs Considered</h2>
    <ul>
      <li>Tradeoff and why this direction was chosen.</li>
    </ul>

    <h2>Open Questions</h2>
    <p>None.</p>

    <h2>Verification</h2>
    <ul>
      <li><code>make format</code> passed.</li>
      <li><code>make verify</code> passed.</li>
    </ul>
  </body>
</html>
```

Add sections only when they carry useful evidence. Do not create boilerplate that says nothing.

## Recipe

1. **Decide whether notes are warranted.**
   - Create notes for non-trivial changes, architecture-sensitive work, behavior that future agents will need to understand, or work with meaningful deviations/tradeoffs.
   - Do not create notes for tiny obvious edits where code/tests are enough.

2. **Choose the slug.**
   - Prefer `<issue-number>-<short-topic>` for issue work.
   - Prefer `<short-topic>` for review fixes or cross-cutting cleanup.
   - Keep the slug stable and lowercase with hyphens.

3. **Record current behavior, not a wish list.**
   - Notes should describe what was implemented and verified.
   - Future work belongs in Open Questions, tech debt, or issue tracker notes.

4. **List design decisions.**
   - Name owning files or boundaries when that helps future readers.
   - Use Household, Member, Owner, User, List, Item, Invitation, Home, Current List, and Household Session language.

5. **Record deviations from the plan or spec.**
   - If none, say `None.`
   - If work changed course, explain why and cite the concrete file or test that forced the change.

6. **Record tradeoffs considered.**
   - Keep these concise.
   - Do not duplicate ADR-level decisions; link to the ADR instead.

7. **Record verification evidence.**
   - Include focused commands and final gates.
   - Include expected failures only when they were part of a test-first proof.
   - Include simulator/RocketSim proof when native behavior mattered.

8. **Update related docs only if lasting guidance changed.**
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
rg "<old-path>|<new-path>|docs/implementations" docs AGENTS.md
```

## Review checklist

- File path is `docs/implementations/<slug>/implementation-notes.html`.
- Notes explain completed work, not speculative plans.
- Design decisions, deviations, tradeoffs, open questions, and verification are accurate.
- Domain language matches `CONTEXT.md`.
- Related durable guidance was updated in the right docs directory when needed.
- Commands and test results are recorded honestly.

# Documentation Workflow

Use this playbook when adding, moving, or updating repository documentation.

## Goal

Put durable knowledge in the right place with minimal duplication and clear links from related docs.

## Choose the Right Location

- `docs/adr/`: architectural decisions, tradeoffs, and consequences.
- `docs/agents/`: repo-specific instructions for AI agents, issue tracking, triage labels, and domain reminders.
- `docs/code-standards/`: enforceable engineering standards.
- `docs/discussions/`: long-form design discussions and decision history.
- `docs/how-things-work/`: focused explanations of implemented systems and policies.
- `docs/implementations/`: implementation notes and proof from completed work.
- `docs/post-mortem/`: incident or regression analysis.
- `docs/tech-debt/`: known gaps with enough context to fix later.
- `docs/workflows/`: procedural playbooks for recurring work.

If a document mixes categories, split it or move the procedural part to a workflow.

## Writing Rules

- Use domain language from `CONTEXT.md`.
- State current behavior, not speculative future behavior, unless the doc is explicitly planning or tech-debt.
- Prefer links over copied explanations.
- Keep rules in `docs/code-standards/`; keep rationale and mechanics in the related how-things-work doc.
- Keep workflows action-oriented: steps, evidence, stop conditions.
- Do not preserve stale docs for compatibility; update references when moving content.

## Moving Docs

When moving or deleting docs:

1. Search for all references with `rg`.
2. Move useful content to the appropriate directory.
3. Update relative links.
4. Remove the old directory if it becomes empty.
5. Run formatting and verification.

## Verification

For docs-only changes:

```bash
make format
make verify
```

If `make verify` is not practical, at minimum run `make format` and search for stale links or old directory names.

## Handoff Checklist

Document changes should say:

- which docs were added, moved, or removed;
- why each new location fits the docs taxonomy;
- which references were updated;
- what verification ran.

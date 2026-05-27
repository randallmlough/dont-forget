# Guides

Guides are concrete repo recipes for creating or changing one specific kind of artifact correctly.

Use a guide when the question is:

> What exact files, names, patterns, tests, and commands do I use to create this thing in this repo?

## Guides vs Workflows

- `docs/workflows/` describes cross-cutting playbooks for a kind of work, such as planning, feature development, bug fixing, refactoring, QA, debugging, documentation, or code review.
- `docs/guides/` describes artifact-specific recipes, such as creating a service, creating an implementation plan, adding a migration, adding a Storybook story, or creating a Household data source.

A workflow can link to one or more guides. A guide should not replace the workflow's decision-making, evidence expectations, or stop conditions.

Use this rule of thumb:

- If the doc starts with "When working on a feature, first...", it belongs in `docs/workflows/`.
- If the doc starts with "To create a new service, add these files...", it belongs in `docs/guides/`.

## Guides vs Other Docs

- Use `docs/how-things-work/` to explain implemented systems and policies.
- Use `docs/code-standards/` for enforceable engineering rules.
- Use `docs/adr/` for architectural decisions and tradeoffs.
- Use `docs/tech-debt/` for known gaps that need future work.

Guides may link to those docs, but should not duplicate them.

## Guide Shape

A good guide should include:

1. **Purpose**: what artifact the guide creates or changes.
2. **Before you start**: required context and standards to read.
3. **Files and naming**: where code/docs belong and how to name them.
4. **Steps**: the concrete recipe.
5. **Tests and verification**: focused checks plus final project gates.
6. **Review checklist**: common mistakes to catch before handoff.

## Candidate Guides

Useful future guides include:

- creating a service;
- creating a Household store or data source;
- creating an implementation plan;
- adding a Storybook story;
- adding a database migration;
- adding a workflow or guide document.

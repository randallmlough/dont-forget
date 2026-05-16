# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

- Read `CONTEXT.md` at the repo root for domain language.
- Read `docs/adr/` for architectural decisions relevant to the task.
- There is no `CONTEXT-MAP.md` and no per-context ADR layout.

## Use The Glossary

When output names a domain concept, use the terms defined in `CONTEXT.md`: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`.

Do not drift to avoided synonyms such as tenant, group, family, team, account, todo, task, or invite link unless the glossary changes.

## Flag ADR Conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it.

# Planning and Research Workflow

Use this playbook before implementation when the request has meaningful ambiguity, architecture risk, unfamiliar code, or product behavior that needs grounding.

## Goal

Leave planning with either:

- a small implementation plan that names files, risks, and verification; or
- one concise user question because the next step depends on a product or technical decision that cannot be inferred safely.

## Read Order

1. Read the user request and restate the target outcome.
2. Read `CONTEXT.md` for domain language and product boundaries.
3. Read `AGENTS.md` and relevant `docs/code-standards/` files.
4. Search `docs/` for related ADRs, how-things-work docs, workflows, tech-debt notes, post-mortems, and implementation notes.
5. Confirm actual behavior in source before treating docs as complete.

## Separate Facts From Assumptions

Capture the planning state as:

- **Facts**: directly observed in source, tests, docs, logs, or tool output.
- **Assumptions**: reasonable inferences that are safe to proceed with.
- **Open questions**: decisions that would materially change the implementation.
- **Constraints**: platform, domain language, architecture boundaries, testing requirements, and user-stated limits.

Do not hide uncertainty in the plan. If two interpretations are plausible, name them and either choose the lower-risk path or ask.

## Research Scope

Keep research proportional:

- Prefer repo-local docs and source first.
- Use official upstream docs when current external behavior matters.
- Avoid broad internet research for stable repo-local patterns.
- Stop researching when the remaining uncertainty does not affect the next implementation step.

## Planning Output

A useful plan has three to five steps. Each step should name the verification signal:

```text
1. Reproduce the bug in the Current List input -> verify with RocketSim keyboard state and logs.
2. Add a focused regression test for the failing state transition -> verify test fails before the fix.
3. Patch the smallest owning component/service -> verify focused test passes.
4. Re-run simulator repro and make verify -> verify original stop condition changed.
```

## Documentation Decision

Update docs only when the work changes or clarifies lasting knowledge:

- `docs/adr/`: architectural decision and tradeoff.
- `docs/how-things-work/`: implemented system behavior or policy.
- `docs/workflows/`: repeatable procedure or playbook.
- `docs/code-standards/`: enforceable engineering rule.
- `docs/tech-debt/`: known gap that should be addressed later.
- `docs/post-mortem/`: incident or regression analysis.

## Stop Conditions

Stop planning and implement when:

- the owning files or modules are identified;
- the intended behavior is clear;
- risks and assumptions are explicit;
- verification is concrete.

Stop and ask the user when the next step depends on product intent, credentials, destructive action, external production state, or a broad architecture choice.

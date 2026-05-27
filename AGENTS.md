# AGENTS.md

## Start Here

- This is **Don't Forget**, an iOS-only Expo/React Native shared shopping-list app. The root `README.md` is still create-expo-app scaffold and is not authoritative for commands, supported platforms, or product intent.
- Before non-trivial work, search `CONTEXT.md` and `docs/`, then confirm behavior in source. `CONTEXT.md` owns domain language: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`; do not replace them with group/team/account/todo/invite link terminology.
- `docs/code-standards/` is the canonical source for day-to-day coding standards; consult it before non-trivial implementation and keep generated human/AI code in conformance.
- `docs/agents/` is the source for repo-specific rules for AI agents to abide by.

## Docs Directory Map

- `docs/adr/` records architectural decisions and the context that made them true.
- `docs/agents/` captures repo-specific instructions for AI agents, issue tracking, triage labels, and domain language reminders.
- `docs/code-standards/` defines enforceable day-to-day engineering standards for humans and agents.
- `docs/discussions/` preserves long-form design discussions and grilling notes that explain how decisions were reached.
- `docs/guides/` gives concrete repo recipes for creating or changing one specific artifact correctly.
- `docs/how-things-work/` explains implemented systems and policies; keep these focused on how the system works, not step-by-step playbooks.
- `docs/implementations/` stores implementation notes and proof from completed work.
- `docs/post-mortem/` captures incident or regression writeups, root causes, fixes, and follow-up lessons.
- `docs/tech-debt/` tracks known design or implementation debt with enough context to address it later.
- `docs/workflows/` contains cross-cutting playbooks for how to perform recurring work, such as planning, feature development, QA, debugging, and code review.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
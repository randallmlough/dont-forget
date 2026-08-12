# Code Review Workflow

Use this playbook to decide whether a change is merge-ready and to give concrete, severity-rated feedback.

## Goal

Review the change against the request, repo standards, architecture boundaries, and verification evidence. The final recommendation should be one of:

- **Approve**: ready to merge.
- **Comment**: non-blocking issues or questions remain.
- **Request changes**: correctness, safety, architecture, or verification issues block merge.

## Establish Scope

1. Read the user request, issue, PR description, or implementation notes.
2. Inspect the diff and changed files.
3. Identify the change type: docs-only, tests-only, UI, service, database, configuration, workflow, or architecture.
4. Read relevant context:
   - `CONTEXT.md` for domain language;
   - `docs/code-standards/` for enforceable rules;
   - relevant ADRs and how-things-work docs;
   - workflow docs when the change is procedural.

## Review Lanes

Check each applicable lane.

### Correctness and Spec

- Does the change satisfy the requested behavior?
- Are edge cases covered: loading, empty, error, retry, offline, stale async response, and cleanup where relevant?
- Does the implementation preserve existing behavior outside the requested scope?

### Tests and Verification

- Is there a focused test for new or changed product behavior when practical?
- Are Storybook stories updated for meaningful visual states?
- Did the author run focused checks, `make format`, and `make verify` when practical?
- Is simulator evidence included when navigation, keyboard, accessibility, native modules, safe areas, or offline/online behavior matters?

### Architecture and Boundaries

- Are route files thin?
- Do mobile route-owned screens live under `apps/mobile/src/screens/`, with feature UI, hooks, and services under `apps/mobile/src/features/<feature>/`?
- Does reusable mobile UI belong under `apps/mobile/src/ui/`?
- Is product data access behind client feature services or server domain modules?
- Are server-only imports kept out of app-safe entrypoints?
- Does the change avoid hidden coupling or unnecessary abstraction?

### React and React Native Quality

- Is state minimal and derived during render where possible?
- Are effects limited to external synchronization and lifecycle resources?
- Are accessibility roles, labels, state, and touch behavior correct?
- Are lists, keyboard behavior, safe areas, and native UI concerns handled for iOS?

### Security and Environment Safety

- No secrets, tokens, or private config in client code or docs.
- Inputs crossing external boundaries are validated.
- Destructive or permission-sensitive actions are authorized and logged appropriately.
- Environment-specific behavior fails closed outside local/test paths.

### Maintainability

- Is the change smaller than a broad rewrite?
- Are names domain-shaped and specific?
- Is duplication intentional and cheaper than abstraction?
- Are comments and docs explaining durable intent rather than restating code?

## Severity Levels

- **Critical**: security vulnerability, data loss, production secret exposure, or unsafe destructive behavior. Must block merge.
- **High**: user-visible bug, broken architecture boundary, missing required authorization, or failing verification. Should block merge.
- **Medium**: maintainability, test coverage, or edge-case gap that should be fixed or explicitly deferred.
- **Low**: nit, clarity suggestion, or optional simplification.

Each finding should include:

- file and line when possible;
- concrete issue;
- risk;
- recommended fix.

## Final Recommendation

Use deterministic gating:

- Request changes if any Critical or High issue remains.
- Comment if only Medium or Low issues remain and the change is otherwise safe.
- Approve only when the change satisfies the request, follows repo standards, and has adequate verification.

## Review Output Template

```text
Recommendation: Approve | Comment | Request changes

Scope reviewed:
- <files or areas>

Verification considered:
- <commands/evidence from author or reviewer>

Findings:
- <severity> <file:line>: <issue>. Risk: <risk>. Fix: <fix>.

Notes:
- <non-blocking observations or tradeoffs>
```

## Reviewer Discipline

- Review the change that was requested, not the change you wish had been requested.
- Do not ask for speculative abstractions.
- Do not block on style preferences already handled by tooling.
- Do call out missing proof when the change depends on native runtime behavior.
- If a finding is outside scope, label it as follow-up instead of making it a merge blocker.

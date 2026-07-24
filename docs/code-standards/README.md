# Code Standards

This directory is the canonical source of truth for day-to-day coding standards in Don't Forget. It is written for both humans and AI agents generating or reviewing code in this repository.

Project-specific background can stay in `docs/how-things-work/`; concrete repo recipes belong in `docs/guides/`; cross-cutting playbooks belong in `docs/workflows/`. This directory should link to those pages when they explain context, recipes, or workflows. When a rule is meant to be enforced during normal implementation or review, capture it here.

## Requirement Levels

- **Must**: required for every human- or AI-authored change unless the exception is explicit in the code review or implementation notes.
- **Should**: the default approach; use local context to override it when another standard or nearby code makes a different choice better.
- **Avoid**: do not introduce this pattern without a concrete justification.

Tooling changes must be explicit in these standards. Biome is the preferred formatter, import organizer, and general TypeScript/React linter. Expo ESLint remains in the verification path until we have evidence that replacing it will not lose Expo or React Native-specific lint coverage.

## Applicability

These standards apply to the whole codebase, including existing code. When a newly documented standard conflicts with current implementation, bring the current implementation into conformance in the same standards pass when feasible. If immediate conformance would create broad churn or require a product/architecture decision, capture the gap as explicit follow-up work instead of leaving it implicit.

## Scope

Code standards cover both:

- React and React Native implementation rules, including component structure, hooks, rendering, lists, styling, animation, navigation, and performance.
- Project-specific boundaries, including routing, app structure, domain language, auth/provider placement, analytics, logging, database access, environment safety, tests, and stories.

When a general React or React Native best practice conflicts with a Don't Forget-specific architecture decision, the project-specific standard wins.

## Change Checklist

For non-trivial changes:

- Read the relevant standards in this directory before editing.
- Use the domain language from `CONTEXT.md` in code, tests, events, logs, and copy.
- Keep route files thin and put route-owned screens in `src/client/screens/`; keep feature UI, hooks, and services in `src/client/features/<feature>`.
- Put product data access in client feature services or server domain modules.
- Use Unistyles and theme tokens for app-owned styling.
- Validate external boundaries with Zod.
- Update meaningful tests and Storybook stories for changed behavior or UI states.
- Use the `rocketsim` CLI to validate UI changes in the iOS Simulator when visual behavior, accessibility, navigation, keyboard handling, or native runtime behavior matters.
- Run `make format` before verification.
- Run `make verify` as the standard final proof when practical.

## AI Slop Review Checklist

Use this checklist before accepting human- or AI-generated React, React Native, or TypeScript changes:

- Are effects only synchronizing with external systems or lifecycle resources?
- Could any state be derived during render instead?
- Are async lifecycles behind route-owned hooks or containers and tested for failure, stale responses, and cleanup?
- Are related state transitions modeled by a reducer or transition helper?
- Are TypeScript boundaries parsed or narrowed instead of asserted?
- Are component props explicit and domain-shaped?
- Is SQL or product data access confined to domain services?
- Does React Native UI have accessibility role, state, labels, and real mobile behavior?
- Are lists tested or storied with realistic data?
- Are errors logged once at the right boundary and surfaced with recovery copy?
- Are tests proving failure modes, not just happy paths?

## Standards

- [Architecture](./architecture.md)
- [React](./react.md)
- [React Native](./react-native.md)
- [React Composition](./react-composition.md)
- [Styling](./styling.md)
- [Testing](./testing.md)
- [Tooling](./tooling.md)
- [TypeScript](./typescript.md)
- [UI Composition](./ui-composition.md)

## Sources

- `AGENTS.md` for repository-wide agent instructions, commands, and architecture constraints.
- `CONTEXT.md` for product language and domain boundaries.
- `docs/guides/` for concrete repo recipes such as creating services, stores, migrations, stories, or docs artifacts.
- `docs/how-things-work/` for focused explanations of implemented systems such as analytics, logging, routing, and environments.
- `docs/workflows/` for cross-cutting playbooks such as planning, feature development, QA, debugging, and code review.
- React and React Native best-practice skills for performance-oriented defaults.

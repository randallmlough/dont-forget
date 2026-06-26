# AGENTS.md

## Start Here

- This is **Don't Forget**, an iOS-only Expo/React Native shared shopping-list app.
- Before non-trivial work, search `CONTEXT.md` and `docs/`, then confirm behavior in source. `CONTEXT.md` owns domain language: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`; do not replace them with group/team/account/todo/invite link terminology.
- For library, framework, SDK, API, CLI, or cloud-service questions, go directly to official upstream sources: vendor docs, API references, release notes, source repositories, and source code. If the source URL is unknown or likely stale, use web search only to find the official source, then rely on that source instead of aggregators or third-party summaries.

## Stack And Layout

- **pnpm** (not npm or yarn), Expo SDK 56, TypeScript, Jest, Biome + ESLint, Clerk auth.
- `app/` — expo-router routes; keep route files thin.
- `screens/<surface>/` — screen-owned views, hooks, and containers.
- `components/` — shared UI, styled with Unistyles theme tokens.
- `lib/services/<domain>/` — domain-first services; all product data access and SQL live here.
- `db/` — Drizzle schema and migrations (libsql/Turso).

## Commands

- `make format` — apply Biome formatting and safe fixes; run before verification.
- `make verify` — typecheck, Biome, ESLint, and tests; the standard final proof for any change.
- In a git worktree, run `make worktree-env` before starting the app; `make worktree-db` for an isolated database.
- `make help` — list all other targets (db, simulator, Storybook, etc.).

## Code Standards (read BEFORE writing code)

Read the relevant file before starting work, not after. `docs/code-standards/README.md` defines requirement levels and the change checklist for non-trivial work.

| Task involves...                        | Read first                                               |
|-----------------------------------------|----------------------------------------------------------|
| Placing new files, services, routes     | docs/code-standards/architecture.md                      |
| React components, hooks, state, effects | docs/code-standards/react.md                             |
| Lists, gestures, images, animation      | docs/code-standards/react-native.md                      |
| Compound components, feature surfaces   | docs/code-standards/react-composition.md                 |
| Bottom sheets, shared UI patterns       | docs/code-standards/ui-composition.md                    |
| Styling or theme tokens                 | docs/code-standards/styling.md                           |
| Tests or Storybook stories              | docs/code-standards/testing.md                           |
| Types, Zod, external boundaries         | docs/code-standards/typescript.md                        |
| Imports, lint, verification             | docs/code-standards/tooling.md                           |
| Naming anything new                     | CONTEXT.md (domain language)                             |
| DB schema or migrations                 | docs/guides/adding-database-migration.md                 |
| New domain service                      | docs/guides/creating-domain-service.md                   |
| Analytics events or logging             | docs/guides/adding-analytics-event-or-logger-contract.md |
| New screen                              | docs/guides/adding-screen-view-split.md                  |

## Docs Directory Map

To understand an existing system (analytics, routing, sync, environments, app structure), check `docs/how-things-work/`. `docs/workflows/` holds playbooks for recurring work (planning, feature development, QA, debugging, code review); `docs/agents/` holds repo-specific agent instructions.

When producing docs, write to the right place: `docs/adr/` for architectural decisions, `docs/discussions/` for long-form design discussions, `docs/implementations/` for notes and proof from completed work, `docs/post-mortem/` for incident or regression writeups, `docs/tech-debt/` for known debt with enough context to address later.

## Before You Start

Assume every project is greenfield with no users. I strive for a single source of truth: no fallbacks, no legacy code support, just one clean stream of information flow.

## Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly; if uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so; push back when warranted.
- If something is unclear, stop, name what's confusing, and ask.

## Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked, no abstractions for single-use code, no unrequested "flexibility" or "configurability", no error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting; don't refactor things that aren't broken; match existing style.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused; leave pre-existing dead code alone unless asked.
- The test: every changed line should trace directly to the user's request.

## Goal-Driven Execution

**Define success criteria. Loop until verified.**

- Transform tasks into verifiable goals: "fix the bug" → "write a test that reproduces it, then make it pass"; "refactor X" → "ensure tests pass before and after".
- For multi-step tasks, state a brief plan: `1. [Step] → verify: [check]`.
- Strong success criteria let you loop independently; weak criteria ("make it work") require constant clarification.

# AGENTS.md

## Start Here

- This is **Don't Forget**, an iOS-only Expo/React Native shared shopping-list app.
- Before non-trivial work, search `CONTEXT.md` and `docs/`, then confirm behavior in source. `CONTEXT.md` owns domain language: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`; do not replace them with group/team/account/todo/invite link terminology.
- For library, framework, SDK, API, CLI, or cloud-service questions, go directly to official upstream sources: vendor docs, API references, release notes, source repositories, and source code. If the source URL is unknown or likely stale, use web search only to find the official source, then rely on that source instead of aggregators or third-party summaries.

## Stack And Layout

- **pnpm** (not npm or yarn), Expo SDK 56, TypeScript, Jest, Biome + ESLint, Clerk auth, PowerSync + Postgres sync.
- `src/app/` — expo-router routes (incl. `src/app/api/**/+api.ts`); keep route files thin.
- `src/client/` — the iOS app: `src/client/features/<feature>/` (screens, hooks, feature services), `src/client/session/` (Authenticated App Session + PowerSync), `src/client/lib/`, `src/client/theme/` (Unistyles theme tokens), `src/client/ui/`.
- `src/server/` — server domain modules (`src/server/bootstrap/`, `src/server/data/`, `src/server/db/`, `src/server/households/`, `src/server/invitations/`, `src/server/sync/`, `src/server/users/`); all server SQL and Drizzle schema/migrations live under `src/server/db/`.
- `src/shared/` — wire contracts and cross-boundary helpers (Zod contracts, env, analytics events).
- `tooling/` — repo tooling: ESLint plugin, Expo config plugins, scripts.

## Commands

- `make format` — apply Biome formatting and safe fixes; run before verification.
- `make verify` — typecheck, Biome, ESLint, and tests; the standard final proof for any change.
- In a git worktree, run `make worktree-env` before starting the app. Isolated-DB worktrees are not yet supported on Postgres (pending PR-E), so `make worktree-db` currently errors.
- `make help` — list all other targets (db, simulator, Storybook, etc.).

## ALWAYS read docs before coding

### Gather and Read The Latest External Library Docs
Your training data is outdated — the docs are the source of truth.

- [React Native](https://reactnative.dev/llms.txt)
- [React](https://react.dev/llms.txt)
- [Expo](https://docs.expo.dev/llms.txt)
- [Clerk](https://clerk.com/docs/llms.txt)
- [PowerSync](https://docs.powersync.com/llms.txt)
- [Zod](https://zod.dev/llms.txt)
- [Unistyles](https://www.unistyl.es/llms.txt)
- [Biome](https://biomejs.dev/docs)
- [Jest](https://jestjs.io/docs)
- [Storybook](https://storybook.js.org/llms.txt)

### Code Standards (read BEFORE writing code)

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

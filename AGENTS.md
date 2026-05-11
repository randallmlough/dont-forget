# AGENTS.md

Shared instructions for AI coding agents working in this repository.

## Mission

Build **Don't Forget**, a shared shopping-list app for Households. Preserve the project language: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation` have specific meanings. Do not replace them with loose synonyms like group, family, team, account, todo, or invite link.

## Research First

For non-trivial changes or "how does this work?" questions, research the repo before coding:

1. Search the docs vault and domain glossary for the topic.
2. Read the relevant docs you find.
3. Confirm current behavior in source code.

Prefer Obsidian CLI for docs because it resolves vault links:

```bash
obsidian vault="docs" search query="<topic>"
obsidian vault="docs" read path="<path from search>"
obsidian vault="docs" files
obsidian vault="docs" backlinks file="<note>"
```

If Obsidian is unavailable or you need code references, use ripgrep:

```bash
rg -n "<topic>" docs CONTEXT.md app components lib db
```

If a change alters architecture, domain language, or cross-cutting conventions, update the relevant docs found through this workflow.

## Hard Rules

- Update `AGENTS.md` only. `CLAUDE.md` is a compatibility symlink to this file.
- Use `pnpm` for project commands. Do not introduce `npm` or `yarn` usage unless explicitly fixing package scripts.
- Preserve user work. The worktree may be dirty; never revert unrelated changes.
- Do not commit secrets, `.env` values, tokens, credentials, or unnecessary PII.
- Do not infer product intent from Expo starter scaffold. Some starter content remains in the tab screens, README, and generic themed components.
- Keep changes scoped. Avoid broad refactors, formatting churn, dependency swaps, and generated-file edits unless required.
- Match nearby code style, including quote style and component patterns.

## Repo Map

- `app/` — Expo Router routes and root provider wiring.
- `components/auth/` — current auth UI patterns.
- `components/`, `hooks/`, `constants/` — mostly reusable UI helpers, some still from Expo starter.
- `lib/analytics.ts` and `lib/analytics-events.ts` — typed product analytics.
- `lib/logger.ts` and `lib/redact.ts` — diagnostic logging and redaction.
- `lib/posthog.ts` — PostHog client construction only; feature code should not import it.
- `db/schema/` — Drizzle schemas split by directory DB and replicated Household DB.
- `db/client.ts` and `db/migrate.ts` — Turso/libSQL clients and migration runner.

Use the `@/*` path alias for repo-root imports when appropriate.

## Commands

```bash
pnpm install
pnpm start
pnpm ios
pnpm android
pnpm web
pnpm lint
pnpm typecheck
pnpm test
pnpm test:ci
pnpm test:coverage
pnpm expo install --check
pnpm audit --audit-level high
pnpm db:generate
pnpm db:migrate
```

For TS/TSX changes, run `pnpm typecheck`, `pnpm lint`, and `pnpm test:ci` when practical. Use `pnpm test` for local watch mode and `pnpm test:coverage` when you need a coverage report. For CI parity, run `make ci` when practical. Only run `pnpm db:migrate` when intentionally applying migrations to configured databases.

## Architecture Constraints

- Expo + React Native app with `expo-router`; keep app-wide providers and auth gating rooted in `app/_layout.tsx` unless there is a strong reason to move them.
- Clerk owns auth. Do not add duplicate Clerk providers. Auth screens should track typed events, call `setActive(...)`, and let root analytics identity sync handle identification.
- Product analytics go through `track(...)` and the typed event map. Do not call `posthog.capture/identify/reset/screen` directly from feature code.
- Diagnostic logs go through `useLogger()` in React and `logger` elsewhere. Pass raw `Error` instances under `error`; do not call `posthog.logger.*` directly.
- PostHog/bootstrap and operator CLIs may use `console.*`; feature code should use the logger.
- Data topology is one server-only directory DB plus one replicated libSQL DB per Household. Do not perform cross-Household SQL joins.
- Directory DB credentials, Turso platform tokens, Clerk secrets, and Resend secrets are server/operator-only. Never expose them through client code or `app.config.js` extras.
- Replicated data uses last-write-wins plus tombstone soft-delete. Do not hard-delete replicated rows from app code.
- Schema changes must preserve compatibility with the previous shipped app version. Generate migrations, review SQL, and use two-phase rollouts for renames/drops.
- Product events are curated. Add or change events by editing the typed event map first; use logs for exploratory diagnostics.

## UI And Code Style

- Use strict TypeScript. Prefer narrow types and Drizzle inferred types over `any`.
- Keep React components simple and local-first; extract only when reuse or readability justifies it.
- Use React Native primitives and `StyleSheet.create`; avoid web-only assumptions.
- Keep controls stable in size and behavior across mobile layouts.
- Make user-facing copy specific to shared Household shopping Lists and Items.
- Add comments only for non-obvious constraints such as provider quirks, migration safety, or sync behavior.

## Verification

Use the smallest proof that covers the change:

- Docs-only: proofread and search for stale terms.
- TS/TSX: run typecheck and lint when practical.
- Tests: run `pnpm test:ci` when practical; database tests use isolated local libSQL files created by `test/db.ts`.
- Auth/routing/provider changes: run an Expo target when practical.
- Analytics/logging: confirm typed events and structured, redacted attributes.
- DB schema: generate migrations and inspect SQL before applying.

If verification is skipped because credentials, simulators, network, or time are unavailable, say so in the final response.

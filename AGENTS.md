# AGENTS.md

This file provides shared guidance for AI coding agents and LLM assistants working with code in this repository.

## Operating principles

- Start from the repo's documented decisions and existing patterns. Do not invent architecture or terminology when `docs/`, `CONTEXT.md`, or nearby code already answers the question.
- Keep changes scoped to the user's request. Avoid broad refactors, formatting churn, dependency swaps, and generated-file edits unless they are necessary for the task.
- Prefer small, type-safe vertical slices. Add shared abstractions only when they remove real duplication or match an established pattern in this repo.
- Be explicit about uncertainty. If an API or architectural rule is unclear, inspect installed package types/source and relevant docs before coding.
- Preserve user work. The worktree may be dirty; never revert or overwrite unrelated changes.
- Treat secrets and user data carefully. Never commit `.env`, tokens, credentials, or unnecessary PII in logs, analytics, docs, tests, or examples.

## Source of truth

Before making non-trivial changes or answering "how does X work?" questions, consult these in order:

- `docs/adr/` — Architecture Decision Records (numbered). The rationale and trade-offs for foundational choices: per-Household DB topology, conflict resolution, migration fanout, logger and analytics abstractions.
- `docs/how-things-work/` — Practical guides for cross-cutting systems (logging, analytics). Read the relevant guide before instrumenting a new feature.
- `CONTEXT.md` — Domain glossary. The terms `Household`, `Member`, `Owner`, `User`, `List`, `Item`, `Invitation` have precise meanings; the file lists synonyms to avoid (e.g. don't say "tenant", "group", or "family" for `Household`). Use these terms verbatim in code, comments, commits, and PRs.
- Source code in `app/`, `components/`, `lib/`, and `db/` — use this to confirm current implementation details after reading the docs.

`docs/` is an Obsidian vault (vault name `docs`). Prefer the `obsidian` CLI for searching and reading rather than ad-hoc text search or raw file reads — it resolves wikilinks and gives clean output:

```bash
# Search across the docs
obsidian vault="docs" search query="logging"

# Read a doc by path (relative to the vault root, which is ./docs)
obsidian vault="docs" read path="how-things-work/logging.md"
obsidian vault="docs" read path="adr/0001-per-household-libsql-database.md"

# List files / backlinks
obsidian vault="docs" files
obsidian vault="docs" backlinks file="logging"
```

When delegating research to another agent, instruct it to start with these `obsidian` commands before reading source.

If a change alters an architectural decision, cross-cutting convention, or domain language, update the relevant ADR, how-things-work doc, or `CONTEXT.md` in the same change.

## Current state to keep in mind

- The app is still partly Expo starter scaffold. `README.md`, `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, and several generic themed components still contain template content. Do not infer product direction from that scaffold; prefer `CONTEXT.md` and `docs/`.
- Auth screens and cross-cutting infrastructure are more representative of the intended code style than the starter tab screens.
- `CLAUDE.md` is a compatibility symlink to this file. Update `AGENTS.md`; do not create divergent agent instruction files.

## Common commands

This project uses **pnpm**. Do not use `npm` or `yarn`.

```bash
# Install
pnpm install

# Dev
pnpm start                 # expo start (Metro + dev menu)
pnpm ios                   # build & run on iOS simulator
pnpm android               # build & run on Android emulator
pnpm web                   # expo web

# Lint
pnpm lint                  # expo lint (eslint with eslint-config-expo)

# Type check
pnpm exec tsc --noEmit

# Database (Drizzle + Turso/libSQL)
pnpm db:generate           # generate migration SQL for both directory + household schemas
pnpm db:generate:directory
pnpm db:generate:household
pnpm db:migrate            # apply pending migrations to the directory DB AND every active household DB
```

There is no test runner configured yet. For TypeScript changes, run `pnpm exec tsc --noEmit` when practical. Run `pnpm lint` for touched TS/TSX code before finishing, especially for UI, auth, analytics, logging, or database work. If you cannot run verification, say so and explain why.

Note: `package.json` currently has `db:generate` implemented with `npm run` internally. Agents should still invoke `pnpm db:generate` from the outside and avoid expanding npm usage unless asked to fix that script.

## Repo map

**Stack:** Expo (RN 0.81, React 19) with `expo-router` file-based routing, Clerk for auth, Turso (libSQL) for storage, Drizzle for schema/queries, PostHog for product analytics + diagnostic logs, Resend for transactional email (server-side).

**Path alias:** `@/*` resolves to the repo root (see `tsconfig.json`).

- `app/` — Expo Router routes and layouts. `app/_layout.tsx` owns root providers, auth gating, and screen analytics.
- `components/auth/` — current reusable auth UI. Prefer these components when changing sign-in/sign-up flows.
- `components/`, `hooks/`, `constants/` — mostly Expo starter UI helpers. Reuse when useful, but don't treat template copy as product requirements.
- `lib/analytics.ts`, `lib/analytics-events.ts` — typed product analytics abstraction.
- `lib/logger.ts`, `lib/redact.ts` — diagnostic logging abstraction and redaction.
- `lib/posthog.ts` — PostHog client construction only. Feature code should not import this.
- `lib/env.ts` — required server-side environment reads.
- `db/schema/directory.ts` — server-only directory DB schema.
- `db/schema/household.ts` — per-Household replicated DB schema.
- `db/client.ts`, `db/migrate.ts` — Turso/libSQL clients and migration runner.

## Implementation style

- Use TypeScript strictly. Prefer narrow types, discriminated unions, and inferred Drizzle types over `any` or loose objects.
- Use `@/*` imports for repo-root imports. Use relative imports for same-folder modules when that is already the local pattern.
- Match the surrounding file's formatting and quote style. The repo currently has mixed starter and newer code styles; do not reformat unrelated files.
- Keep React components simple and local-first. Extract components when reused or when a screen becomes hard to read, not preemptively.
- In React Native UI, use `StyleSheet.create`, stable sizes for controls, and platform-aware APIs. Avoid web-only DOM/CSS assumptions.
- Keep user-facing copy aligned with the app domain: shared Household shopping Lists and Items. Avoid starter-template language in new product surfaces.
- Prefer `Alert`/inline validation messages that are actionable and do not expose raw provider errors unless already sanitized through helpers such as `userMessage(...)`.
- Add comments sparingly, only where they explain a non-obvious constraint such as provider quirks, migration safety, or sync behavior.

## Architecture rules

### Data topology — per-Household databases

This is the load-bearing decision. There is **one libSQL database per Household**, replicated to each Member's device, plus **one server-only "directory" database** that holds `households`, `memberships`, and `invitations`. Users live in Clerk and are referenced by `clerk_user_id`. See `docs/adr/0001-per-household-libsql-database.md`.

Implications you must respect:
- **No cross-Household SQL joins.** Cross-Household views are application-level unions.
- **Schema migrations fan out to N+1 DBs.** `db/migrate.ts` migrates the directory DB then iterates every active Household DB. Migrations must be **backward-compatible** with the previous shipped app version (Turso's WAL replication propagates DDL to device replicas immediately, while old app builds in the wild may still be running). Add columns with `DEFAULT`s freely; renames/drops require a two-phase rollout. See `docs/adr/0003-schema-migration-fanout.md`.
- **Drizzle schemas are split:** `db/schema/directory.ts` (server-only) and `db/schema/household.ts` (replicated). They have separate `drizzle.*.config.ts` files and separate migration folders under `db/migrations/`.
- **Directory DB is server-only.** Do not put directory DB credentials or platform tokens in client-side app code.

### Conflict resolution

Row-level last-write-wins on `items` and `lists`. The high-collision `checked` state is split into a separate `item_checks` table keyed by `(item_id, member_id)` so two Members tapping the same item never conflict. **All replicated tables use tombstone soft-delete (`deleted_at`)** — never hard-delete from the app. Server-side GC removes tombstones after replicas catch up. See `docs/adr/0002-row-level-lww-with-split-checked-state.md`.

When adding replicated tables or write paths:
- Include the sync/conflict fields the existing schema uses (`created_at`, `updated_at`, `deleted_at`) unless an ADR says otherwise.
- Model high-collision user-specific state separately instead of adding it to a shared LWW row.
- Use millisecond epoch integers for existing timestamp conventions.

### Auth

Clerk via `@clerk/clerk-expo`. Apple Sign In is the primary path; email/password and Google are also supported. `app/_layout.tsx` wires `<ClerkProvider>` → `<ClerkLoaded>` → `<AuthGate>`. `AuthGate` redirects between `/sign-in` and `(tabs)` based on session state and warms up the OAuth browser while signed-out so the first SSO tap is snappy. Don't add Clerk providers anywhere else.

Auth implementation notes:
- Use `tokenCache` from `lib/token-cache.ts` for Clerk's secure token persistence.
- Auth screens should call `track(...)` for typed events and then `setActive(...)`; they should not call `identify(...)`.
- Pair sign-out with `track("user_signed_out", {})`, then `reset()`, then Clerk `signOut()`; order matters.
- Use `userMessage(error)` for Clerk-facing alerts unless a flow needs more specific, sanitized copy.

### Logging and analytics — go through the abstractions

These are first-class architectural layers; do not call PostHog directly from feature code.

- **Diagnostic logs** → `lib/logger.ts`. Use `useLogger()` in React, `logger` elsewhere. Four levels (`debug | info | warn | error`). See `docs/how-things-work/logging.md` and `docs/adr/0004-pluggable-logger-abstraction.md`.
- **Product analytics** → `lib/analytics.ts`. Event names + property shapes are typed in `lib/analytics-events.ts` (`EventMap`); `track(...)` is compile-time checked against it. **Never** call `posthog.capture/identify/reset/screen` directly. Identity is auto-synced from Clerk by `useAnalyticsIdentity()` in `app/_layout.tsx` — auth screens do not call `identify`. See `docs/how-things-work/analytics.md` and `docs/adr/0005-pluggable-analytics-abstraction.md`.
- Both abstractions share the redaction helpers in `lib/redact.ts` (Bearer tokens + JWT-shaped strings + a deny-list of sensitive attribute keys).
- `db/migrate.ts` and other operator-facing CLIs intentionally use `console.*`, not the logger.

Logging and analytics conventions:
- Log messages: short, lowercase, present tense, no trailing punctuation. Put IDs and measurements in snake_case attributes.
- Pass raw `Error` instances under the `error` key; let the adapter normalize and redact them.
- Add product events by editing `EventMap` first, then calling `track(...)`. Do not bypass typing with broad `Record<string, unknown>` event properties.
- Use logs for exploratory diagnostics and errors; use analytics only for curated product events that may feed funnels or dashboards.

### Routing

`expo-router` with file-based routes under `app/`. `(tabs)` is the authenticated home; `sign-in.tsx` and `sign-up.tsx` are the auth screens; `modal.tsx` is presented modally. The `screen(...)` analytics call fires from `app/_layout.tsx` on every pathname change — feature code does not call it.

Routing notes:
- Keep provider setup in `app/_layout.tsx` unless there is a clear app-wide reason to move it.
- Keep auth-only routes outside `(tabs)` and authenticated app routes inside `(tabs)` or later authenticated route groups.
- Do not add manual screen tracking in feature screens; root routing already handles it.

### Environment

Client-visible config is limited to `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and the PostHog values intentionally exposed through `app.config.js` extras (`POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`). Server-only secrets (Turso platform tokens, Clerk secret, Resend key) live in `.env` and are loaded by Node/server entrypoints. See `.env.example` for the full list. Use `requireEnv(key)` from `lib/env.ts` to read required server vars — it throws with a clear message if missing.

Environment rules:
- Client code may reference `EXPO_PUBLIC_*` directly and `Constants.expoConfig.extra` keys that are intentionally exposed by `app.config.js`. Do not add new extras for server-only values.
- `TURSO_*`, `CLERK_SECRET_KEY`, and `RESEND_*` are server/operator-only. Never expose them through `app.config.js` extras that ship to the client.
- `lib/posthog.ts` is the exception that may use `console.warn` during bootstrap because the logger depends on PostHog initialization.

## Database changes

When changing Drizzle schema:
- Edit the appropriate schema file (`directory.ts` for server-only membership/invitation metadata, `household.ts` for replicated List/Item data).
- Generate migrations with `pnpm db:generate` or the specific directory/household script.
- Review generated SQL before accepting it, especially for SQLite table rebuilds, drops, renames, and defaults.
- Preserve backward compatibility for one shipped app version. Use two-phase migrations for renames and drops.
- Do not hand-edit migration metadata unless repairing a known drizzle-kit issue and documenting why.

When changing migration behavior:
- Keep `db/migrate.ts` operator-facing with clear `console.*` output.
- Expect partial success across Household DBs; changes must be safe to rerun.
- Close libSQL clients in `finally` blocks.

## Verification checklist

Use the smallest verification that proves the change:

- Docs-only or instruction-only changes: proofread and search for stale terms.
- TS/TSX changes: `pnpm exec tsc --noEmit` and `pnpm lint` when practical.
- Routing/auth changes: run an Expo target (`pnpm ios`, `pnpm android`, or `pnpm web`) if the change affects navigation, providers, or sign-in behavior.
- Analytics/logging changes: confirm new events are typed in `EventMap`; confirm logs use redacted structured attributes.
- DB schema changes: run migration generation and inspect SQL; run `pnpm db:migrate` only when intentionally applying to configured databases.

If verification is skipped because credentials, simulators, network, or time are unavailable, state that explicitly in the final response.

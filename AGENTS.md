# AGENTS.md

This file provides shared guidance for AI coding agents and LLM assistants working with code in this repository.

## Documentation — read this first

Before making non-trivial changes or answering "how does X work?" questions, consult `docs/`. It is the source of truth for architecture, conventions, and the *why* behind decisions:

- `docs/adr/` — Architecture Decision Records (numbered). The rationale and trade-offs for foundational choices: per-Household DB topology, conflict resolution, migration fanout, logger and analytics abstractions.
- `docs/how-things-work/` — Practical guides for cross-cutting systems (logging, analytics). Read the relevant guide before instrumenting a new feature.
- `CONTEXT.md` — Domain glossary. The terms `Household`, `Member`, `Owner`, `User`, `List`, `Item`, `Invitation` have precise meanings; the file lists synonyms to avoid (e.g. don't say "tenant", "group", or "family" for `Household`). Use these terms verbatim in code, comments, commits, and PRs.

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

When delegating research to a subagent, instruct it to start with these `obsidian` commands before reading source.

## Common commands

This project uses **pnpm**. Do not use `npm` or `yarn`.

```bash
# Install
pnpm install

# Dev
pnpm start                 # expo start (Metro + dev menu)
pnpm ios                   # build & run on iOS simulator
pnpm android               # build & run on Android emulator

# Lint
pnpm lint                  # expo lint (eslint with eslint-config-expo)

# Database (Drizzle + Turso/libSQL)
pnpm db:generate           # generate migration SQL for both directory + household schemas
pnpm db:generate:directory
pnpm db:generate:household
pnpm db:migrate            # apply pending migrations to the directory DB AND every active household DB
```

There is no test runner configured yet. Type-checking is enabled (`tsconfig.json` has `strict: true`); rely on `tsc` via your editor or `pnpm exec tsc --noEmit` to catch type errors.

## Architecture

**Stack:** Expo (RN 0.81, React 19) with `expo-router` file-based routing, Clerk for auth, Turso (libSQL) for storage, Drizzle for schema/queries, PostHog for product analytics + diagnostic logs, Resend for transactional email (server-side).

**Path alias:** `@/*` resolves to the repo root (see `tsconfig.json`).

### Data topology — per-Household databases

This is the load-bearing decision. There is **one libSQL database per Household**, replicated to each Member's device, plus **one server-only "directory" database** that holds `households`, `memberships`, and `invitations`. Users live in Clerk and are referenced by `clerk_user_id`. See `docs/adr/0001-per-household-libsql-database.md`.

Implications you must respect:
- **No cross-Household SQL joins.** Cross-Household views are application-level unions.
- **Schema migrations fan out to N+1 DBs.** `db/migrate.ts` migrates the directory DB then iterates every active Household DB. Migrations must be **backward-compatible** with the previous shipped app version (Turso's WAL replication propagates DDL to device replicas immediately, while old app builds in the wild may still be running). Add columns with `DEFAULT`s freely; renames/drops require a two-phase rollout. See `docs/adr/0003-schema-migration-fanout.md`.
- **Drizzle schemas are split:** `db/schema/directory.ts` (server-only) and `db/schema/household.ts` (replicated). They have separate `drizzle.*.config.ts` files and separate migration folders under `db/migrations/`.

### Conflict resolution

Row-level last-write-wins on `items` and `lists`. The high-collision `checked` state is split into a separate `item_checks` table keyed by `(item_id, member_id)` so two Members tapping the same item never conflict. **All replicated tables use tombstone soft-delete (`deleted_at`)** — never hard-delete from the app. Server-side GC removes tombstones after replicas catch up. See `docs/adr/0002-row-level-lww-with-split-checked-state.md`.

### Auth

Clerk via `@clerk/clerk-expo`. Apple Sign In is the primary path; email/password and Google are also supported. `app/_layout.tsx` wires `<ClerkProvider>` → `<ClerkLoaded>` → `<AuthGate>`. `AuthGate` redirects between `/sign-in` and `(tabs)` based on session state and warms up the OAuth browser while signed-out so the first SSO tap is snappy. Don't add Clerk providers anywhere else.

### Logging and analytics — go through the abstractions

These are first-class architectural layers; do not call PostHog directly from feature code.

- **Diagnostic logs** → `lib/logger.ts`. Use `useLogger()` in React, `logger` elsewhere. Four levels (`debug | info | warn | error`). See `docs/how-things-work/logging.md` and `docs/adr/0004-pluggable-logger-abstraction.md`.
- **Product analytics** → `lib/analytics.ts`. Event names + property shapes are typed in `lib/analytics-events.ts` (`EventMap`); `track(...)` is compile-time checked against it. **Never** call `posthog.capture/identify/reset/screen` directly. Identity is auto-synced from Clerk by `useAnalyticsIdentity()` in `app/_layout.tsx` — auth screens do not call `identify`. See `docs/how-things-work/analytics.md` and `docs/adr/0005-pluggable-analytics-abstraction.md`.
- Both abstractions share the redaction helpers in `lib/redact.ts` (Bearer tokens + JWT-shaped strings + a deny-list of sensitive attribute keys).
- `db/migrate.ts` and other operator-facing CLIs intentionally use `console.*`, not the logger.

### Routing

`expo-router` with file-based routes under `app/`. `(tabs)` is the authenticated home; `sign-in.tsx` and `sign-up.tsx` are the auth screens; `modal.tsx` is presented modally. The `screen(...)` analytics call fires from `app/_layout.tsx` on every pathname change — feature code does not call it.

### Environment

Public config (Clerk publishable key, PostHog token) is read via `EXPO_PUBLIC_*` and `expo-constants`/`app.config.js`. Server-only secrets (Turso platform token, Clerk secret, Resend key) live in `.env` and are loaded by Node entrypoints (`db/migrate.ts`). See `.env.example` for the full list. Use `requireEnv(key)` from `lib/env.ts` to read required server vars — it throws with a clear message if missing.

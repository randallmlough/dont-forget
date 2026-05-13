# AGENTS.md

## Start Here

- This is **Don't Forget**, an Expo/React Native shared shopping-list app. The root `README.md` is still create-expo-app scaffold and is not authoritative for commands or product intent.
- Before non-trivial work, search `CONTEXT.md` and `docs/`, then confirm behavior in source. `CONTEXT.md` owns domain language: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`; do not replace them with group/team/account/todo/invite link terminology.
- Keep shared agent guidance in `AGENTS.md`; there is no repo-wide `CLAUDE.md`, Cursor rule, or Copilot instruction file to update.

## Commands

- CI runs Node 22 and `pnpm@10.11.0`. Prefer `make` targets; if invoking package scripts directly, use `pnpm`, never the README's `npm` or `npx` examples.
- Install: `pnpm install` locally; CI uses `pnpm install --frozen-lockfile`.
- App dev: `make start`, `make ios`, `make android`, `make web`.
- Standard TS/TSX proof: `make verify` runs `typecheck -> lint -> test-ci`. Full CI parity: `make ci` adds Expo package check, public config resolution, and high-severity audit.
- Focused Jest proof: `pnpm exec jest --runInBand --runTestsByPath <test-file>`; add `-t "<test name>"` for one test. `pnpm test` is watch mode.
- Storybook: `make storybook`, `make storybook-ios`, `make storybook-android`; after adding, moving, or deleting stories, run `make storybook-generate`.
- Database: `make db-generate-directory`, `make db-generate-household`, or `make db-generate`. Run `make db-migrate` only when intentionally applying migrations to configured Turso databases.

## Architecture

- Single Expo app, no workspace packages. The JS entrypoint is `expo-router/entry`; app-wide PostHog, Clerk, theme, auth gating, and screen tracking are wired in `app/_layout.tsx`.
- Do not add duplicate Clerk/PostHog providers. Auth screens should track typed events and call `setActive(...)`; `useAnalyticsIdentity()` in the root syncs identity. Sign-out order is `track("user_signed_out", {})`, then `reset()`, then `signOut()`.
- `app/(tabs)/index.tsx` is Home. Current active-List UI lives in `components/active-list` and `components/home`; some generic Expo starter components still remain, so do not infer product behavior from scaffold screens or themed helpers.
- Data is split between a server-only directory DB (`db/schema/directory.ts`) for Households/Memberships/Invitations and one replicated Household libSQL DB (`db/schema/household.ts`) per Household for Lists/Items/`item_checks`. Do not perform cross-Household SQL joins.
- Replicated data uses row-level last-write-wins; `item_checks` is separate from `items` to avoid checked-state conflicts. App delete paths write tombstones (`deleted_at`), not hard deletes.
- Drizzle migrations have two folders. `drizzle.household.config.ts` is SQL-only; `db/migrate.ts` migrates the directory DB, then every active Household DB, and partial success is possible. Schema changes must stay compatible with the previous shipped app version; use two-phase renames/drops and inspect generated SQL.
- Env safety: `.env.example` separates client-safe `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from server/operator secrets. `app.config.js` should expose only public PostHog config through Expo `extra`; never expose Turso platform tokens, Clerk secrets, or Resend secrets to client code.

## App Conventions

- Use the `@/*` root alias, React Native primitives, and `StyleSheet.create`; avoid web-only assumptions.
- React Compiler is enabled in `app.json`; do not add memoization hooks reflexively, but preserve deliberate list/perf patterns in nearby code.
- For composed feature surfaces, prefer domain-shaped context `{ state, actions, meta }`; use compound exports only when there is a real shared provider, as in `ActiveList`.
- Product analytics go through `track`, `screen`, and `reset` from `lib/analytics.ts`; add or change events in `lib/analytics-events.ts` first. Feature code must not call PostHog directly.
- Diagnostic logs go through `useLogger()` in React and `logger` elsewhere. Pass raw `Error` instances as `{ error }`; bootstrap code and Node CLIs such as `db/migrate.ts` may use `console.*`.
- User-facing copy should stay specific to Household Lists and Items; avoid generic dashboard, todo, team, or account language unless the product glossary changes.

## Testing Notes

- Tests are React Native-first with `jest-expo` and React Native Testing Library; there is no separate jsdom or MSW track.
- `test/setup.ts` mocks Clerk, native auth/browser/storage, and PostHog. Mock external SDK/native boundaries, not local product behavior.
- Do not put tests in `app/`; Expo Router treats files there as routes/layouts. Route tests live in `test/app`; colocated tests are fine elsewhere.
- DB tests use `test/db.ts` to create temp local libSQL files and apply checked-in migration SQL from `db/migrations/**`; never use `db:migrate` in tests.
- Storybook is native-only via `STORYBOOK_ENABLED=true` and `withStorybook`. Do not add a `/storybook` route; `.rnstorybook/index.ts` must keep `registerRootComponent(StorybookUIRoot)`.

## Change Hygiene

- Keep changes scoped. Edit generated files only when the source change requires it, especially `db/migrations/**` and `.rnstorybook/storybook.requires.ts`.
- If architecture, domain language, analytics/logging policy, command workflow, or testing workflow changes, update `CONTEXT.md` or the relevant `docs/how-things-work/*` / ADR with the code.

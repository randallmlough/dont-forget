# AGENTS.md

## Start Here

- This is **Don't Forget**, an iOS-only Expo/React Native shared shopping-list app. The root `README.md` is still create-expo-app scaffold and is not authoritative for commands, supported platforms, or product intent.
- Before non-trivial work, search `CONTEXT.md` and `docs/`, then confirm behavior in source. `CONTEXT.md` owns domain language: `Household`, `Member`, `Owner`, `User`, `List`, `Item`, and `Invitation`; do not replace them with group/team/account/todo/invite link terminology.
- Keep shared agent guidance in `AGENTS.md`; there is no repo-wide `CLAUDE.md`, Cursor rule, or Copilot instruction file to update.

## Commands

- CI runs Node 22 and `pnpm@10.11.0`. Prefer `make` targets; if invoking package scripts directly, use `pnpm`, never the README's `npm` or `npx` examples.
- Install: `pnpm install` locally; CI uses `pnpm install --frozen-lockfile`.
- App dev: `make start`, `make ios`. Android and Web are unsupported targets; do not preserve Android/Web compatibility unless the platform policy changes.
- Standard TS/TSX proof: `make verify` runs `typecheck -> lint -> test-ci`. Full CI parity: `make ci` adds Expo package check, public config resolution, and high-severity audit.
- Focused Jest proof: `pnpm exec jest --runInBand --runTestsByPath <test-file>`; add `-t "<test name>"` for one test. `pnpm test` is watch mode.
- Storybook: `make storybook` starts the dev server for an installed native iOS build/dev client; `make storybook-ios` builds/runs Storybook with `expo run:ios`. Do not use Expo Go for Storybook. After adding, moving, or deleting stories, run `make storybook-generate`.
- Database: `make db-generate` runs every Drizzle config in `db/drizzle`. Run `make db-migrate APP_ENV=staging` only when intentionally applying migrations to configured Turso databases; production also requires `CONFIRM_APP_ENV=production`. Run `make db-reset APP_ENV=<env> CONFIRM_DB_RESET=<env>` only when intentionally deleting app data from the directory DB and all known Household DBs; production also requires `CONFIRM_APP_ENV=production`.

## Architecture

- Single iOS-only Expo app, no workspace packages. The JS entrypoint is `index.ts`, which loads Unistyles before `expo-router/entry`; app-wide PostHog, Clerk, theme, auth gating, and screen tracking are wired in `app/_layout.tsx`.
- Do not add duplicate Clerk/PostHog providers. Auth screens should track typed events and call `setActive(...)`; `useAnalyticsIdentity()` in the root syncs identity. Sign-out order is `track("user_signed_out", {})`, then `reset()`, then `signOut()`.
- Expo Router uses route groups: `app/(app)` for authenticated app routes and `app/(auth)` for signed-out auth routes. `/` is Home at `app/(app)/index.tsx`; route-owned screen code lives in `screens/`; reusable feature UI such as Active List lives in `components/active-list`.
- Data is split between a server-only directory DB (`db/schema/directory.ts`) for Households/Memberships/Invitations and one replicated Household libSQL DB (`db/schema/household.ts`) per Household for Lists/Items/`item_checks`. Do not perform cross-Household SQL joins.
- Replicated data uses row-level last-write-wins; `item_checks` is separate from `items` to avoid checked-state conflicts. App delete paths write tombstones (`deleted_at`), not hard deletes.
- Drizzle migrations have two folders. `db/drizzle/household.config.ts` is SQL-only; `db/migrate.ts` migrates the directory DB, then every active Household DB, and partial success is possible. Schema changes must stay compatible with the previous shipped app version; use two-phase renames/drops and inspect generated SQL.
- Env safety: `APP_ENV` is the app-owned backend selector (`local`, `test`, `staging`, `production`). Use the same secret names per selected environment rather than suffixed production/staging names in one process. `.env.example` separates client-safe `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from server/operator secrets. `app.config.ts` should expose only public config through Expo `extra`; never expose Turso platform tokens, Clerk secrets, or Resend secrets to client code.

## App Conventions

- Use the `@/*` root alias and iOS-safe React Native primitives. Android and Web are not supported targets; avoid adding platform forks for them.
- Keep `app/` files as thin route entries when practical. Put route-owned UI and screen-local side effects in `screens/<surface>/`, and put reusable app components in `components/`.
- Unistyles is the app-owned styling foundation. Migrate existing `StyleSheet.create` surfaces to Unistyles rather than adding NativeWind/Uniwind className styling. Keep `@expo/ui/swift-ui` controls behind app-owned wrappers when introduced; style SwiftUI internals with Expo UI modifiers, not by assuming normal React Native style inheritance.
- React Compiler is enabled in `app.json`; do not add memoization hooks reflexively, but preserve deliberate list/perf patterns in nearby code.
- For composed feature surfaces, prefer domain-shaped context `{ state, actions, meta }`; use compound exports only when there is a real shared provider, as in `ActiveList`.
- Product analytics go through `track`, `screen`, and `reset` from `lib/analytics.ts`; add or change events in `lib/analytics-events.ts` first. Feature code must not call PostHog directly.
- Diagnostic logs go through `useLogger()` in React and `logger` elsewhere. Pass raw `Error` instances as `{ error }`; bootstrap code and Node CLIs such as `db/migrate.ts` may use `console.*`.
- User-facing copy should stay specific to Household Lists and Items; avoid generic dashboard, todo, team, or account language unless the product glossary changes.

## Testing Notes

- Tests are React Native-first with `jest-expo` and React Native Testing Library; there is no separate jsdom or MSW track.
- `lib/test/setup.ts` mocks Clerk, native auth/browser/storage, and PostHog. Reusable mocks live in `lib/test/mocks/`. Mock external SDK/native boundaries, not local product behavior.
- Do not put tests in `app/`; Expo Router treats files there as routes/layouts. Colocate tests next to the screen or module they exercise outside `app/`.
- DB tests use `db/test.ts` to create temp local libSQL files and apply checked-in migration SQL from `db/migrations/**`; never use `db:migrate` in tests.
- Storybook is native-only via `STORYBOOK_ENABLED=true` and `withStorybook`. Do not add a `/storybook` route; `.rnstorybook/index.ts` must keep `registerRootComponent(StorybookUIRoot)`.

## Change Hygiene

- Keep changes scoped. Edit generated files only when the source change requires it, especially `db/migrations/**` and `.rnstorybook/storybook.requires.ts`.
- If architecture, domain language, analytics/logging policy, command workflow, or testing workflow changes, update `CONTEXT.md` or the relevant `docs/how-things-work/*` / ADR with the code.

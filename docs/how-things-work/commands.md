# Commands

Prefer `make` for project commands. The `Makefile` wraps `pnpm`; do not use `npm` or `yarn` unless you are explicitly fixing package scripts. The Don't Forget mobile application is iOS-only. A dedicated web package supports only the public Invitation and Household Join Code link surface; it is not a general web version of the app.

App and Storybook make targets default to `APP_ENV=local` unless you pass another environment. Database migrations are the exception: they require an explicit `APP_ENV`.

Expo start and iOS targets accept `PORT=<number>` so parallel worktrees do not
collide on Metro's default `8081` port:

```bash
make start PORT=8090
make ios PORT=8090
```

`PORT` controls Metro/iOS only. The standalone API uses `API_PORT` and defaults
to `8080`; the dedicated web package uses `WEB_PORT` and defaults to `3000`:

```bash
make api API_PORT=8088
make api-build
make web WEB_PORT=3010
make web-build
```

Fresh linked worktrees should run `make worktree-env` once. It preserves the
shared `.env.local` link/copy behavior and creates an ignored, secret-free
`.env.worktree` with checkout-local `API_PORT`, `WEB_PORT`, and matching
`PUBLIC_WEB_BASE_URL` values.

<!-- ==================================================================================== -->
<!-- COMMANDS                                                                              -->
<!-- ==================================================================================== -->

## Common

| Command | Description |
| --- | --- |
| `make install` | Install dependencies. |
| `make worktree-env` | Link/copy local `.env.local` and generate checkout-local API/web ports in `.env.worktree`. |
| `make start` | Start the Expo development server for the app. |
| `make api` | Start the standalone API in watch mode. |
| `make api-build` | Build and mechanically verify the standalone Node 22 API bundle. |
| `make web` | Start the dedicated public web link surface. |
| `make ios` | Build and run the app on iOS. |
| `make storybook` | Start Storybook for an installed native iOS build/dev client. |
| `make verify` | Run typecheck, Biome, local ESLint rule tests, whole-project ESLint, and tests. |
| `make ci` | Run the full CI contract locally. |

## App

| Command | Description |
| --- | --- |
| `make start` | Start Expo for normal app development. |
| `make ios` | Run the native iOS target. |

## API

| Command | Description |
| --- | --- |
| `make api` | Start the standalone API in watch mode. Pass `API_PORT=<number>` to override port 8080. |
| `make api-build` | Independently build and verify `dist/main.mjs`; the artifact excludes mobile and web application inputs. |

## Web

| Command | Description |
| --- | --- |
| `make web` | Start the dedicated public Invitation and Household Join Code link surface. Pass `WEB_PORT=<number>` to override port 3000. |
| `make web-build` | Independently build and mechanically verify the dedicated public static web artifact. |

## Storybook

| Command | Description |
| --- | --- |
| `make storybook` | Start the Storybook dev server for an installed native iOS build/dev client. |
| `make storybook-ios` | Build and run Storybook on iOS with `expo run:ios`. |
| `make storybook-generate` | Regenerate `.rnstorybook/storybook.requires.ts` after adding, moving, or removing stories. |

## Verification

| Command | Description |
| --- | --- |
| `make verify` | Run typecheck, Biome, local ESLint rule tests, whole-project ESLint, and tests. |
| `make ci` | Run typecheck, Biome, whole-project ESLint, tests, Expo checks, and high-severity dependency audit. |
| `make typecheck` | First pass for TypeScript and TSX changes. |
| `make biome-check` | Check Biome formatting, import organization, and lint rules. |
| `make lint` | Whole-project ESLint proof using the Expo flat config plus repo rules. |
| `make format` | Apply Biome formatting, import organization, and safe fixes. |
| `make test-ci` | Preferred test proof for CI-like local verification. |
| `make test-coverage` | Run Jest with coverage output. |
| `make audit` | Audit dependencies for high-severity vulnerabilities. |
| `make expo-check` | Check Expo SDK package compatibility. |
| `make expo-config-check` | Validate dynamic public Expo config without printing it. Defaults to `APP_ENV=local` unless `APP_ENV` is provided. |
| `make expo-clear` | Start Expo with a cleared Metro cache. Useful after dependency or Metro config changes. |

## Tests

| Command | Description |
| --- | --- |
| `make test` | Run Jest in watch mode. |
| `make test-ci` | Run all tests once. Database tests use isolated, ephemeral local databases. |
| `make test-coverage` | Run all tests once and report coverage. |

## Database

| Command | Description |
| --- | --- |
| `make db-generate` | Generate migrations for every Drizzle config in `src/server/db/drizzle`. |
| `make db-migrate APP_ENV=staging` | Apply migrations to the selected environment. Only run when intentionally migrating real configured targets. Production also requires `CONFIRM_APP_ENV=production`. |
| `make db-reset APP_ENV=local CONFIRM_DB_RESET=local` | Delete app data from the selected environment's Postgres database (directory and product tables). Production also requires `CONFIRM_APP_ENV=production`. |
| `make db-seed` | Seed local data without resetting. Pass `EMAIL=<address>` to add an email-scoped Clerk-backed seed Household for Owner and plain Member sign-in. |
| `make db-reseed` | Reset, migrate, and seed local deterministic development data. Pass `EMAIL=<address>` only when you intentionally want the destructive reset followed by the Clerk-backed seed path. |

<!-- ==================================================================================== -->
<!-- UTILITIES                                                                             -->
<!-- ==================================================================================== -->

## Utilities

| Command | Description |
| --- | --- |
| `make help` | Display Makefile targets grouped by section. |
| `make worktree-env` | Create `.env.local` for a worktree from another checkout or `WORKTREE_ENV_FILE`, then generate ignored checkout-local API/web port overrides in `.env.worktree`. Use `WORKTREE_ENV_MODE=copy` to copy instead of symlink. |
| `make expo-config` | Print the public Expo config after dynamic config resolution. |
| `make why PKG=<package>` | Inspect why a package is installed. |
| `make outdated` | Show dependencies with available newer versions. |
| `pnpm exec <bin>` | Run a package binary directly from the project dependency graph. |
| `rg "<term>" docs src tooling` | Search docs and source for a term. |
| `make status` | Check the current worktree without verbose output. |

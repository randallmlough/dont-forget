# Commands

Prefer `make` for project commands. The `Makefile` wraps `pnpm`; do not use `npm` or `yarn` unless you are explicitly fixing package scripts. Don't Forget is iOS-only: Android and Web targets are unsupported.

<!-- ==================================================================================== -->
<!-- COMMANDS                                                                              -->
<!-- ==================================================================================== -->

## Common

| Command | Description |
| --- | --- |
| `make install` | Install dependencies. |
| `make start` | Start the Expo development server for the app. |
| `make ios` | Build and run the app on iOS. |
| `make storybook` | Start Storybook for an installed native iOS build/dev client. |
| `make verify` | Run typecheck, lint, and tests. |
| `make ci` | Run the full CI contract locally. |

## App

| Command | Description |
| --- | --- |
| `make start` | Start Expo for normal app development. |
| `make ios` | Run the native iOS target. |
| `make reset-project` | Run Expo's starter reset script. Use only when intentionally resetting scaffolded files. |

## Storybook

| Command | Description |
| --- | --- |
| `make storybook` | Start the Storybook dev server for an installed native iOS build/dev client. |
| `make storybook-ios` | Build and run Storybook on iOS with `expo run:ios`. |
| `make storybook-generate` | Regenerate `.rnstorybook/storybook.requires.ts` after adding, moving, or removing stories. |

## Verification

| Command | Description |
| --- | --- |
| `make verify` | Run typecheck, lint, and tests. |
| `make ci` | Run typecheck, lint, tests, Expo checks, and high-severity dependency audit. |
| `make typecheck` | First pass for TypeScript and TSX changes. |
| `make lint` | Style and lint proof for app code. |
| `make test-ci` | Preferred test proof for CI-like local verification. |
| `make test-coverage` | Run Jest with coverage output. |
| `make audit` | Audit dependencies for high-severity vulnerabilities. |
| `make expo-check` | Check Expo SDK package compatibility. |
| `make expo-config-check` | Validate dynamic public Expo config without printing it. |
| `make expo-clear` | Start Expo with a cleared Metro cache. Useful after dependency or Metro config changes. |

## Tests

| Command | Description |
| --- | --- |
| `make test` | Run Jest in watch mode. |
| `make test-ci` | Run all tests once. Database tests use isolated local libSQL files. |
| `make test-coverage` | Run all tests once and report coverage. |

## Database

| Command | Description |
| --- | --- |
| `make db-generate` | Generate migrations for every Drizzle config in `db/drizzle`. |
| `make db-migrate` | Apply migrations to configured databases. Only run when intentionally migrating real configured targets. |

<!-- ==================================================================================== -->
<!-- UTILITIES                                                                             -->
<!-- ==================================================================================== -->

## Utilities

| Command | Description |
| --- | --- |
| `make help` | Display Makefile targets grouped by section. |
| `make expo-config` | Print the public Expo config after dynamic config resolution. |
| `make why PKG=<package>` | Inspect why a package is installed. |
| `make outdated` | Show dependencies with available newer versions. |
| `pnpm exec <bin>` | Run a package binary directly from the project dependency graph. |
| `rg "<term>" docs app screens components lib db` | Search docs and source for a term. |
| `make status` | Check the current worktree without verbose output. |

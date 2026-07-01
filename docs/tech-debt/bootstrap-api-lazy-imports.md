# Remove Bootstrap API Route Lazy Imports

## Context

`app/api/bootstrap+api.ts` lazy-loads server-only modules inside `POST` to prevent native Expo Router route registration from evaluating database, auth, and bootstrap imports during iOS bundling.

This is separate from the app's data layer. The PowerSync migration replaced native Household DB access, but it did not change how Expo API Route modules are discovered or bundled.

## Why This Is Debt

The lazy import pattern makes the route harder to read and test. It also hides the server dependency graph from static imports, so future route changes may accidentally reintroduce bundling issues.

## Revisit When

- Expo Router/API Route bundling behavior has been re-tested on the current SDK.
- Server Drizzle/Postgres imports can use explicit server-safe entrypoints without Metro/Jest package-root remapping.

## Desired Direction

Replace the dynamic imports with a thin, statically imported route handler only after a focused proof passes:

- `make verify`
- `APP_ENV=local pnpm expo export --platform ios`
- `APP_ENV=local pnpm expo export --platform web`

The proof should also verify that the server Postgres client (`pg`) imports cleanly under Metro/Jest without package-root remapping.

# @libsql/client in React Native

This is a postmortem for the libSQL issues we hit while wiring durable Household List data into the iOS Expo app.

## Summary

`@libsql/client` is not one runtime-neutral client. Its package root can resolve to entrypoints that expect Node or native binaries, while the Expo React Native app needs a web-compatible client and Expo API Routes need an HTTP-compatible server client. Importing the wrong entrypoint produced native bundling failures before app code could run.

The fix is to make the runtime explicit:

- Historical app-side direct Household DB access used `@libsql/client/web`; current app-side Household DB access goes through the app-owned Household DB wrapper/`HouseholdStore` and `@tursodatabase/sync-react-native`.
- Server/API Route and migration DB clients import `@libsql/client/http` in `db/client.ts`.
- Metro and Jest map exact package-root imports from `@libsql/client` to `@libsql/client/http` because Drizzle's libsql adapter can resolve the package root internally.
- Expo API Route modules avoid eager server imports at module scope; `app/api/bootstrap+api.ts` lazy-loads server-only modules inside `POST`.

ADR-0009 changes the target app-side direction: `@libsql/client/web` was a temporary remote-client bridge for Home, not the desired native app database runtime. The iOS app now routes Household DB access through `@tursodatabase/sync-react-native` behind an app-owned wrapper so Home can use a local synced Household DB. Server/API route, migration, reset, and Node test code may continue using explicit `@libsql/client` server-safe entrypoints.

The native Household DB package does **not** solve the `app/api/bootstrap+api.ts` lazy-loading problem. That problem comes from Expo API Route module discovery/evaluation crossing the native bundle boundary; removing the lazy imports is a separate bundling proof tracked in `docs/tech-debt/bootstrap-api-lazy-imports.md`.

## What Failed

The first working implementation accidentally crossed runtime seams.

Native app bundling failed with errors like:

```text
Unable to resolve module node:buffer
Requiring unknown module "@libsql/darwin-arm64"
```

Those were not database-auth or Turso-provisioning bugs. They were module-resolution bugs: Metro was trying to include code paths that do not belong in the iOS React Native bundle.

We saw two related failure modes:

- The app-side Active List adapter imported a libSQL entrypoint that pulled Node-oriented dependencies such as `node:buffer`.
- Expo Router's native route registration evaluated API Route modules enough that server-only imports could leak into native bundling, including Drizzle/libsql code paths that resolved the package root.

## Why This Happened

The repo has three different runtimes touching libSQL:

- iOS React Native app code, which runs in the native app JavaScript runtime.
- Expo API Routes, which run as server code after web export/EAS Hosting deployment.
- Node CLIs/tests, such as migration and bootstrap verification code.

`@libsql/client` exposes runtime-specific entrypoints. The package root is too ambiguous for this app because Metro, Jest, Drizzle, and Expo API Route bundling do not all resolve it with the same assumptions.

The important distinction is:

- `@libsql/client/web` is safe for app-side remote libSQL access from React Native.
- `@libsql/client/http` is safe for server/API Route and Node-style HTTP access.
- `@libsql/client` package-root imports are unsafe in this codebase unless deliberately remapped.

## The Current Containment

Use explicit libSQL entrypoints only at server, migration, reset, and Node test seams. App-side Household DB access should stay on the app-owned native wrapper.

The previous temporary app-side Household List reads/writes lived behind a remote adapter:

```ts
import { createClient } from "@libsql/client/web";
```

That kept direct remote Household DB access out of components, but it was not the final local-first shape. ADR-0009 chooses `@tursodatabase/sync-react-native` behind an app-owned Household DB wrapper as the native replacement; ADR-0011 names that wrapper `HouseholdStore` under the domain-first service layer.

Server-side DB clients live in `db/client.ts`:

```ts
import { createClient, type Client } from "@libsql/client/http";
```

That gives API Routes, migrations, and server bootstrap code a consistent HTTP client without relying on libSQL package-root resolution.

Metro still has a defensive resolver override:

```js
if (moduleName === "@libsql/client") {
  return context.resolveRequest(context, "@libsql/client/http", platform);
}
```

Jest mirrors that mapping. This is not for product code importing `@libsql/client` directly; it keeps transitive Drizzle/libsql resolution aligned with the Expo native bundler.

Finally, `app/api/bootstrap+api.ts` lazy-loads server modules inside `POST`. That keeps native route registration from evaluating server-only DB/auth/bootstrap imports while the app bundle is being built.

## Rules Going Forward

- Do not import `@libsql/client` from product code.
- Do not add app-side `@libsql/client/web` usage. App-side Household DB access belongs behind `lib/services/household/household-store.ts` after ADR-0011 migration; until migrated, use the existing app-owned Household DB wrapper only as legacy code.
- Use `@libsql/client/http` for server/API Route, migration, and Node verification code.
- Keep direct Household SQL inside domain services that depend on `HouseholdStore`. Screens, hooks, and components must not issue Household SQL directly.
- Keep API Route files thin and lazy-load server-only dependencies inside request handlers.
- If removing the Metro/Jest mapping, first prove Drizzle no longer resolves the package root during native export and Jest runs.
- If removing `bootstrap+api.ts` lazy imports, treat it as a separate Expo API Route bundling proof; the native Household DB package does not make that safe by itself.

## How To Verify Changes

When touching libSQL imports, Drizzle setup, API Routes, or Metro/Jest resolution, run:

```bash
make verify
APP_ENV=local pnpm expo export --platform ios
APP_ENV=local pnpm expo export --platform web
```

The iOS export catches native bundle leaks. The web export catches API Route bundling issues. `make verify` catches type/lint/test regressions and keeps Jest aligned with Metro resolution.

## Relevant Files

- `lib/services/household/household-store.ts` after ADR-0011 migration
- `lib/services/list/list-service.ts` and `lib/services/item/item-service.ts`
- `lib/services/household/household-sync-fallback.ts` for the temporary remote sync fallback
- `db/client.ts`
- `app/api/bootstrap+api.ts`
- `metro.config.js`
- `jest.config.js`
- `db/client.test.ts`
- `lib/server/bootstrap-api-route.test.ts`
- `docs/adr/0009-turso-react-native-for-native-household-sync.md`
- `docs/tech-debt/bootstrap-api-lazy-imports.md`

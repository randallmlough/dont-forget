# @libsql/client in React Native

This is a postmortem for the libSQL issues we hit while wiring durable Household List data into the iOS Expo app.

## Summary

`@libsql/client` is not one runtime-neutral client. Its package root can resolve to entrypoints that expect Node or native binaries, while the Expo React Native app needs a web-compatible client and Expo API Routes need an HTTP-compatible server client. Importing the wrong entrypoint produced native bundling failures before app code could run.

The fix is to make the runtime explicit:

- App-side direct Household DB access imports `@libsql/client/web` in `lib/app/active-list-adapter.ts`.
- Server/API Route and migration DB clients import `@libsql/client/http` in `db/client.ts`.
- Metro and Jest map exact package-root imports from `@libsql/client` to `@libsql/client/http` because Drizzle's libsql adapter can resolve the package root internally.
- Expo API Route modules avoid eager server imports at module scope; `app/api/bootstrap+api.ts` lazy-loads server-only modules inside `POST`.

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

## The Solution

Use explicit libSQL entrypoints at app-owned seams.

App-side Household List reads/writes live behind `createRemoteActiveListAdapter`:

```ts
import { createClient } from "@libsql/client/web";
```

That keeps direct remote Household DB access out of components and prevents native app code from importing the package root.

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
- Use `@libsql/client/web` only from app-side adapters that run in the iOS app.
- Use `@libsql/client/http` for server/API Route, migration, and Node verification code.
- Keep direct Household SQL behind app-owned adapters such as `lib/app/active-list-adapter.ts` so true local replica sync can replace it later.
- Keep API Route files thin and lazy-load server-only dependencies inside request handlers.
- If removing the Metro/Jest mapping, first prove Drizzle no longer resolves the package root during native export and Jest runs.

## How To Verify Changes

When touching libSQL imports, Drizzle setup, API Routes, or Metro/Jest resolution, run:

```bash
make verify
APP_ENV=local pnpm expo export --platform ios
APP_ENV=local pnpm expo export --platform web
```

The iOS export catches native bundle leaks. The web export catches API Route bundling issues. `make verify` catches type/lint/test regressions and keeps Jest aligned with Metro resolution.

## Relevant Files

- `lib/app/active-list-adapter.ts`
- `db/client.ts`
- `app/api/bootstrap+api.ts`
- `metro.config.js`
- `jest.config.js`
- `db/client.test.ts`
- `lib/server/bootstrap-api-route.test.ts`

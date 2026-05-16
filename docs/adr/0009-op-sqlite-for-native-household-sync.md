# op-sqlite for native Household sync, with libSQL kept on server seams

The iOS app needs true local Household DB access: Home should reopen offline after a prior bootstrap, accept local Item/List writes, and sync when connectivity returns. We will use `@op-engineering/op-sqlite` with its Turso backend for the native app Household DB path, replacing the temporary app-side `@libsql/client/web` remote adapter. Server/API route, migration, reset, and Node test code will keep explicit `@libsql/client` server-safe entrypoints unless a separate server-driver proof replaces them later.

## Considered Options

- **Keep `@libsql/client/web` in the app.** Rejected because it only gives the app remote DB access and does not deliver offline local writes or cold-start offline Home.
- **Use op-sqlite's libSQL backend.** Rejected for the target path because Turso now describes legacy embedded replicas as less suitable for new true local-first sync use cases.
- **Use op-sqlite's Turso backend.** Chosen because it is the viable React Native/iOS path for a local synced Turso-backed database while keeping the app inside Expo native builds.
- **Remove `@libsql/client` everywhere.** Rejected for this milestone because server, migration, and test code already work through explicit HTTP/Node entrypoints and are a separate runtime problem from native app sync.

## Consequences

- The app-side Active List adapter should become a synced local adapter and stop importing `@libsql/client`.
- Direct Household DB access stays behind app-owned adapters; feature components should not depend on op-sqlite directly.
- Household schema migrations remain server-owned. The app does not run bundled migrations against synced Household DB files.
- Cached bootstrap metadata must not include Household DB auth tokens. If native proof shows op-sqlite cannot reopen and write the local synced DB without a cached token, reopen the token-cache decision before building a custom sync/outbox layer.
- `app/api/bootstrap+api.ts` lazy imports are not solved by op-sqlite. Removing them is tracked separately in `docs/tech-debt/bootstrap-api-lazy-imports.md`.

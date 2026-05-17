# Turso React Native sync for native Household DB access

The iOS app needs true local Household DB access: Home should reopen offline after a prior bootstrap, accept local Item/List writes, and sync when connectivity returns. We will use `@tursodatabase/sync-react-native` behind `lib/app/household-db.ts` for the native app Household DB path. Server/API route, migration, reset, and Node test code will keep explicit `@libsql/client` server-safe entrypoints unless a separate server-driver proof replaces them later.

This revises the earlier op-sqlite candidate after the Issue #6 spike found Turso's official React Native sync package can be installed, wrapped behind an app-owned interface, exercised in Jest through mocks, and bundled for iOS.

## Considered Options

- **Keep `@libsql/client/web` in the app.** Rejected because it only gives the app remote DB access and does not deliver offline local writes or cold-start offline Home.
- **Use op-sqlite's Turso backend.** Rejected for now because Turso's official React Native sync package is a closer product fit and avoids adding an app-side driver that is not the sync engine owner.
- **Use `@tursodatabase/sync-react-native`.** Chosen because it exposes local open/query/write plus explicit `push()`/`pull()` primitives against Turso Cloud using the bootstrap-provided Household DB URL and auth token shape.
- **Remove `@libsql/client` everywhere.** Rejected for this milestone because server, migration, and test code already work through explicit HTTP/Node entrypoints and are a separate runtime problem from native app sync.

## Consequences

- App-side Household SQL must go through `lib/app/household-db.ts` or feature adapters that depend on its app-owned interface. Feature components must not import `@tursodatabase/sync-react-native` directly.
- Local DB filenames are keyed by app-owned Household IDs, not Turso database names, so future Household switching can add more local DBs without changing the domain model.
- The wrapper adapts Turso's `all()` and `run()` result shapes into the app's `execute()` result shape. The wrapper implements `sync()` as `push()` then `pull()` because package `0.6.0` exposes `push()` and `pull()` but not the README-documented `sync()` method.
- Household schema migrations remain server-owned. The app does not run bundled migrations against synced Household DB files.
- Cached bootstrap metadata must not include Household DB auth tokens. Opening a synced DB for push/pull still requires a fresh bootstrap token; offline reopen without authorization is a separate Home startup slice.
- Turso Sync's package-level conflict behavior is still documented as last-push-wins. App writes must continue using row-level LWW timestamps, `item_checks`, and tombstones so the replicated rows remain semantically mergeable even though transport ordering is push-based.
- The package requires native linking and its JS entrypoint installs JSI bindings at module load. Keep the app-owned wrapper's import lazy so Jest and non-native code can test against mocks without loading the native module.
- `app/api/bootstrap+api.ts` lazy imports are not solved by the native Household DB package. Removing them is tracked separately in `docs/tech-debt/bootstrap-api-lazy-imports.md`.

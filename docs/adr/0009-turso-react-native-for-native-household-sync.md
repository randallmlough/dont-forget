# Turso React Native sync for native Household DB access

The iOS app needs true local Household DB access: Home should reopen offline after a prior bootstrap, accept local Item/List writes, and sync when connectivity returns. We will use `@tursodatabase/sync-react-native` behind an app-owned Household DB wrapper for the native app Household DB path. ADR-0011 later names that wrapper `HouseholdStore` under `lib/services/household/household-store.ts`; this ADR originally referred to `lib/app/household-db.ts`. Server/API route, migration, reset, and Node test code will keep explicit `@libsql/client` server-safe entrypoints unless a separate server-driver proof replaces them later.

This revises the earlier op-sqlite candidate after the Issue #6 spike found Turso's official React Native sync package can be installed, wrapped behind an app-owned interface, exercised in Jest through mocks, and bundled for iOS.

## Considered Options

- **Keep `@libsql/client/web` in the app.** Rejected because it only gives the app remote DB access and does not deliver offline local writes or cold-start offline Home.
- **Use op-sqlite's Turso backend.** Rejected for now because Turso's official React Native sync package is a closer product fit and avoids adding an app-side driver that is not the sync engine owner.
- **Use `@tursodatabase/sync-react-native`.** Chosen because it exposes local open/query/write plus explicit `push()`/`pull()` primitives against Turso Cloud using the bootstrap-provided Household DB URL and auth token shape.
- **Remove `@libsql/client` everywhere.** Rejected for this milestone because server, migration, and test code already work through explicit HTTP/Node entrypoints and are a separate runtime problem from native app sync.

## Consequences

- App-side Household SQL must go through the app-owned Household DB wrapper/`HouseholdStore` or domain services that depend on its app-owned interface. Feature components must not import `@tursodatabase/sync-react-native` directly. If native sync cannot checkpoint and push a local replica, the Active List data source may use the Authenticated App Session DB token for a narrow remote upsert recovery path so offline Item changes are not stranded locally.
- Local DB filenames are keyed by app-owned Household IDs, not Turso database names, so future Household switching can add more local DBs without changing the domain model.
- The wrapper adapts Turso's `all()` and `run()` result shapes into the app's `execute()` result shape. The wrapper implements `sync()` as `push()` then `pull()` because package `0.6.0` exposes `push()` and `pull()` but not the README-documented `sync()` method.
- Household schema migrations remain server-owned. The app does not run bundled migrations against synced Household DB files.
- Cached bootstrap metadata must not include Household DB auth tokens. Opening a synced DB for push/pull still requires a fresh bootstrap token; offline reopen without authorization is a separate Home startup slice.
- Turso Sync's package-level conflict behavior is documented as last-push-wins. App writes must continue using app-owned `updated_at` timestamps, `item_checks`, and tombstones so the replicated rows remain predictable for display, recovery upserts, and future migration paths even though transport ordering is push-based.
- The package requires native linking and its JS entrypoint installs JSI bindings at module load. Keep the app-owned wrapper's import lazy so Jest and non-native code can test against mocks without loading the native module.
- `app/api/bootstrap+api.ts` lazy imports are not solved by the native Household DB package. Removing them is tracked separately in `docs/tech-debt/bootstrap-api-lazy-imports.md`.

## Issue #9 Sync Orchestration Finding

`Home` and `ActiveList` can compose with Turso Sync when feature UI depends only on the app-owned Active List adapter. Local Item writes commit to the local Household DB first, then the UI marks sync pending and asks the adapter to run an explicit app-owned local-push operation. If that sync attempt fails, the List keeps the locally written Item state and surfaces a failed sync state instead of treating the local write as failed.

Manual refresh runs a full adapter `sync()` before reloading List rows through the normal adapter `load()` path. This matters after offline writes: a pull-only refresh cannot upload locally queued Item changes when connectivity returns. The Household DB wrapper pulls before pushing and pulls again afterward so a stale local replica can advance before uploading its local changes. Turso Sync's documented last-push-wins transport behavior is compatible with Don't Forget's row-level timestamp LWW model only because List and Item rows still carry app-generated `updated_at` values, checked state remains isolated in `item_checks`, and app deletes remain tombstones. The app should continue to treat package sync ordering as transport, not as the domain conflict-resolution strategy.

Native sync package `0.6.0` can leave an offline-written replica unable to push with `unable to checkpoint synced portion of WAL` after reconnect. The app-owned adapter first tries native `push()` for automatic local-write sync, and recovers from native push failure by upserting local `lists`, `items`, and `item_checks` rows to the remote Household DB using the same `updated_at` LWW predicates, then keeps the local List visible. This fallback is intentionally scoped to replicated Household rows and should be removed only after the native sync path can be proven not to strand offline writes.

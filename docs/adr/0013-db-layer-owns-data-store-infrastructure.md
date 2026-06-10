# db layer owns data-store infrastructure

ADR-0011 placed `HouseholdStore` under `lib/services/household/` while declaring it "not a service". That contradiction grew visible: the app-safe `lib/services/household/index.ts` re-exported nothing but the store, the store contained no Household domain logic, and the server got its `DirectoryDb`/`HouseholdDb` connections from `db/client.ts` while the app got its symmetric store from the service layer. Meanwhile nothing enforced that app-safe services avoid `@libsql/client` infrastructure — the existing ESLint rule only guarded `app/`, `screens/`, and `components/`.

We will make `db/` the single home for data-store infrastructure on both runtimes, with an explicit app-safe/server-only boundary inside it.

## Decision

- The `db/` root is app-safe and shared:

  ```txt
  db/
    schema/              # Drizzle schema, shared between Expo app and API Routes
    utils.ts             # operation queue, sqlNumberSchema, busy retry
    household-store.ts   # HouseholdStore: Turso RN sync wrapper (app runtime)
    migrations/          # generated SQL, referenced by path
    drizzle/             # drizzle-kit configs, referenced by path
    server/              # server-only — see below
  ```

- Everything that touches `@libsql/client`, operator config, migration tooling, or Node-only test seeding lives under `db/server/`: `client.ts`, `migrate.ts`, `household-migrations.ts`, `generate.ts`, `reset.ts`, `test.ts`, and `fixtures/`. This mirrors the `lib/services/<domain>/server/` convention from ADR-0011.
- `HouseholdStore` moves from `lib/services/household/household-store.ts` to `db/household-store.ts`. The name does not change; it is recorded domain language. This supersedes ADR-0011's placement of the store inside the household domain folder.
- `lib/services/household/` becomes a server-only domain (only `server/`), the same shape as `member/` and `user/`. There is no app-safe household index and no re-export shim; consumers import store APIs from `@/db/household-store`.
- The store's sync contract moves down with it: `SyncResult`, `SyncInterruptedError`, `isSyncInterruptedError`, and the native sync-error classification live in `db/household-store.ts`, because the store is the only module that knows native Turso engine error messages. The db layer never imports from `lib/services/`.
- `lib/services/sync` keeps coordinator-level vocabulary (`SyncStatus`, `SyncRequestReason`, `SyncMode`, `SyncOptions`, `SyncCoordinator`) and re-exports the `SyncResult` type only. `SyncResult` is also coordinator vocabulary (`requestSync` returns it), and app-facing code may consume types only through the service layer, never from `@/db`.
- Session services remain the composition root for the store: `createSessionDataServices` opens `HouseholdStore` via `openHouseholdStore` and injects the executor into List/Item services, because store lifetime is tied to the Authenticated App Session (ADR-0012).
- A new ESLint rule (`no-db-server-imports`) enforces the boundary: `@/db/server/*` is importable only from `db/server/**`, `lib/services/**/server/**`, `lib/api/**`, `scripts/**`, tests, and lazily inside `app/api/**` request handlers. The existing `no-db-imports-outside-services` rule continues to bar app-facing code from all of `@/db/*`.

## Considered options

- **Keep the store under `lib/services/household/` (status quo).** Rejected: ADR-0011's own text says the store is not a service; the app-side household folder held nothing else; the placement split symmetric infrastructure across two layers.
- **Explicit `db/app/` + `db/server/` folders.** Rejected: introduces an `app/` convention that exists nowhere else; the root-is-app-safe + nested `server/` shape already exists in `lib/services/`.
- **Flat `db/` with per-file lint exceptions.** Rejected: the boundary would live only in lint config and the folder structure would stop telling the truth.
- **Leave the sync contract in `lib/services/sync` and accept a db-to-services import.** Rejected: breaks layering and invites cycles.
- **A stateful connection manager in `db/`.** Rejected: duplicates the lifecycle the Authenticated App Session controller already owns.

## Consequences

- The db layer is the bottom layer: it imports only cross-cutting utilities (`lib/errors`, `lib/logger`), never services.
- App-safe service code is now lint-blocked from server db infrastructure instead of convention-blocked.
- `package.json` db scripts point at `db/server/` (`db:generate`, `db:migrate`, `db:reset`).
- ADR-0011's service-layer rules (factory DI, SQL ownership, naming, runtime nesting for services) remain in force; only the store's placement clause is superseded.

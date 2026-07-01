# db layer owns data-store infrastructure

_Amended 2026-06-30 ([ADR-0018](0018-single-postgres-self-hosted-powersync.md)): `db/` still owns data-store infrastructure and the three ESLint rules (`no-db-server-imports`, `no-db-imports-outside-services`, `no-services-imports-in-db`) are unchanged — they now guard the server Postgres client and the `/api/data` applicator ([ADR-0016](0016-data-write-applicator-in-db-layer.md)). `HouseholdStore`, its operation queue, and the Turso sync contract are deleted; the app-side store is now PowerSync, opened in `lib/powersync/`._

ADR-0011 placed `HouseholdStore` under `lib/services/household/` while declaring it "not a service". That contradiction grew visible: the app-safe `lib/services/household/index.ts` re-exported nothing but the store, the store contained no Household domain logic, and the server got its `DirectoryDb`/`HouseholdDb` connections from `db/client.ts` while the app got its symmetric store from the service layer. Meanwhile nothing enforced that app-safe services avoid `@libsql/client` infrastructure — the existing ESLint rule only guarded `app/`, `screens/`, and `components/`.

We will make `db/` the single home for data-store infrastructure on both runtimes, with an explicit app-safe/server-only boundary inside it.

## Decision

- The `db/` root is app-safe and shared:

  ```txt
  db/
    schema/              # Drizzle schema (Postgres), shared between Expo app and API Routes
    utils.ts             # sqlNumberSchema and shared schema helpers
    migrations/          # generated SQL, referenced by path
    drizzle/             # drizzle-kit configs, referenced by path
    server/              # server-only — see below
  ```

- Everything that touches the server Postgres client, operator config, migration tooling, the `/api/data` write applicator, or Node-only test seeding lives under `db/server/`: `pg-client.ts`, `migrate.ts`, `generate.ts`, `reset.ts`, `test.ts`, `sync/` (the `/api/data` applicator — see [ADR-0016](0016-data-write-applicator-in-db-layer.md)), and `fixtures/`. This mirrors the `lib/services/<domain>/server/` convention from ADR-0011.
- `lib/services/household/` is a server-only domain (only `server/`), the same shape as `member/` and `user/`. There is no app-safe household index and no re-export shim.
- The db layer never imports from `lib/services/`. Under PowerSync the app-side data store is `@powersync/op-sqlite`, opened in `lib/powersync/` and exposed to services through the `ProductDatabase` seam; there is no `db/household-store.ts`, no `SyncResult`/`SyncInterruptedError` sync contract, and no `lib/services/sync` coordinator vocabulary — all deleted with Turso.
- The PowerSync provider opens the local database once and the session controller injects the `ProductDatabase` seam into List/Item services, because store lifetime is tied to the Authenticated App Session (ADR-0012).
- A new ESLint rule (`no-db-server-imports`) enforces the boundary: `@/db/server/*` is importable only from `db/server/**`, `lib/services/**/server/**`, `lib/api/**`, `scripts/**`, tests, and lazily inside `app/api/**` request handlers. The existing `no-db-imports-outside-services` rule continues to bar app-facing code from all of `@/db/*`.
- A companion ESLint rule (`no-services-imports-in-db`) enforces the downward direction: non-test code under `db/**` must not import `@/lib/services/**` or `@/lib/api/**`, so the layering inversion this ADR removed cannot silently return.

## Considered options

- **Keep the store under `lib/services/household/` (status quo).** Rejected: ADR-0011's own text says the store is not a service; the app-side household folder held nothing else; the placement split symmetric infrastructure across two layers.
- **Explicit `db/app/` + `db/server/` folders.** Rejected: introduces an `app/` convention that exists nowhere else; the root-is-app-safe + nested `server/` shape already exists in `lib/services/`.
- **Flat `db/` with per-file lint exceptions.** Rejected: the boundary would live only in lint config and the folder structure would stop telling the truth.
- **Leave the sync contract in `lib/services/sync` and accept a db-to-services import.** Rejected: breaks layering and invites cycles.
- **A stateful connection manager in `db/`.** Rejected: duplicates the lifecycle the Authenticated App Session controller already owns.

## Consequences

- The db layer is the bottom layer: it imports only cross-cutting `lib/` utilities (`lib/errors`, `lib/logger`, `lib/env`, `lib/load-env`, `lib/bootstrap` constants), never `lib/services/` or `lib/api/`. The never-services/api half is lint-enforced by `no-services-imports-in-db`.
- App-safe service code is now lint-blocked from server db infrastructure instead of convention-blocked.
- `package.json` db scripts point at `db/server/` (`db:generate`, `db:migrate`, `db:reset`).
- ADR-0011's service-layer rules (factory DI, SQL ownership, naming, runtime nesting for services) remain in force; only the store's placement clause is superseded.

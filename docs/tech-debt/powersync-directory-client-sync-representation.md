# Directory PowerSync client-sync: timestamp representation and stream projections

## Context

The PowerSync migration lands as a sequence (`A → B → C1 → C2 → D → E`). PR-C1 re-points the
**directory** database (Users, Households, Memberships, Invitations, Household Join Codes) to Postgres
while product data stays on per-Household Turso and **PowerSync stays unwired for the client** — during
C1 the client receives directory data through the `/api` bootstrap session as numeric epoch-millis
(`z.number()`), not from the local PowerSync database. PR-C2 ("Client onto PowerSync") is where the
client actually connects to PowerSync and reads synced rows locally.

Because PR-A/PR-B authored the PowerSync scaffolding ahead of the cut-over, the directory's published
shape and the client schema already disagree in two ways that are **latent in C1** (no client reads the
local PowerSync directory tables yet) but become live the moment C2 wires the client onto PowerSync:

1. **Timestamp representation.** Directory timestamps are `bigint` epoch-millis in Postgres
   (`db/schema/postgres/directory.ts`, per ADR-0017 Decision 1), but the client schema
   (`lib/powersync/schema.ts`) declares `households.created_at`/`deleted_at` and
   `memberships.joined_at`/`removed_at` as `column.text` documented as ISO text. PowerSync serializes a
   `bigint` as an integer, so under the current client schema those values would materialize as numeric
   strings rather than ISO strings. (PowerSync does not fail or drop rows on this mismatch — undefined
   shapes are stored but inaccessible — but the stored value's semantics are wrong.)

2. **Stream projections.** The directory streams in `infra/powersync/sync-config.yaml` were written
   broadly. `turso_db_name` and `provisioning_completed_at` are intentionally retained on `households`
   through C1 (~20 files read/write them while product data is on Turso; **C2 is the sole PR that drops
   both columns + their writers**), so any directory stream must avoid publishing server-only columns to
   client devices. (PR-C1 already narrowed `my_households` to the client-modeled columns; `me`/users
   still streams `created_at`/`updated_at` that the client schema does not model.)

## Debt (resolve in PR-C2, "Client onto PowerSync")

When the client is wired onto PowerSync, reconcile the directory tables' synced representation with the
client schema. Two viable approaches:

- Cast the directory timestamp columns to the client's representation in the sync queries (bigint
  epoch-millis → ISO text), **or**
- Change the client schema column types to match what PowerSync emits for `bigint` (integer
  epoch-millis), keeping `z.number()` consistency end-to-end.

Also fold in: audit every directory stream projection against the C2 client schema (drop server-only
columns, e.g. confirm `me`/users excludes non-modeled fields), and **correct ADR-0017 Decision 1's
wording** — it currently reads "the directory ... is not in the PowerSync publication," but
`users`/`households`/`memberships` are in the `powersync` publication; the accurate statement for the
end state is that the directory is not synced to clients *during C1* (bootstrap path), and becomes
client-synced in C2.

## Source

PR #132 (PR-C1) review feedback, 2026-06-28 — two PowerSync-alignment comments (households `SELECT *`
projection; directory bigint-vs-ISO timestamp representation), both verified as real-but-latent and
deferred here because directory↔PowerSync client sync is PR-C2's scope.

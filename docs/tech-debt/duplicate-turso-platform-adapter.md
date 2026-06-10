# Consolidate The Two Turso Platform API Adapters

## Context

The Turso Platform API now has two hand-rolled clients:

- `lib/services/household/server/turso-platform.ts` — used by Household provisioning (zod-validated payloads, `TursoPlatformError`).
- `scripts/turso-platform-api.ts` — used by the worktree DB isolation scripts (status-tolerance lists, plus `deleteDatabase`, which the server adapter lacks).

The duplication exists because `tools/eslint-rules/no-server-service-imports.js` blocks `scripts/` from importing server services. That rule protects the app bundle from operator secrets, but operator scripts run in the same trust domain as the server, so the boundary is stricter than the risk it guards.

## Why This Is Debt

Two clients for one external API drift: they already diverge on error handling, payload validation, and supported operations. A Turso API change (auth, payload shape, endpoints) must be fixed twice, and only one copy has tests.

## Revisit When

- A third operator script needs the Turso Platform API, or
- either client needs a new operation (token revocation, group management), or
- the Turso Platform API changes shape.

## Desired Direction

Pick one home for the adapter. Either allow `scripts/` (and `db/`) as legitimate importers in `no-server-service-imports.js`, or move the Turso Platform client out of `lib/services/household/server/` into operator infrastructure both can import — it is an external-API adapter, not a Household domain service. Then `deleteDatabase` joins the single client and the scripts copy is deleted.

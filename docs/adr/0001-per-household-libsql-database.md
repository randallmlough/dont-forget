# Per-Household libSQL database, plus a server-only directory database

> Superseded by [ADR-0018](0018-single-postgres-self-hosted-powersync.md) (PowerSync migration, 2026-06-30).

Households share Lists and Items across multiple Members' devices, with offline-first edits and seconds-scale eventual consistency. We use **one Turso (libSQL) database per Household**, replicated to each Member's device via the Turso React Native bindings, plus a single server-only **directory database** that holds `users`, `households`, `memberships`, and `invitations`. Clerk owns authentication identity; Don't Forget stores app-owned User records in the directory DB linked to Clerk by `clerk_user_id`, and product tables reference app `user_id`.

## Considered alternatives

- **Single shared DB with `household_id` on every row.** Rejected: without Turso's not-yet-shipped partial sync, every device pulls every Household's data. Privacy and storage non-starter.
- **One DB per User, with the server replicating Household data into each User's DB.** Rejected: write amplification (a Member's edit must propagate via the server into every co-Member's per-User DB) and muddled conflict timing. Effectively rebuilds logical replication on top of Turso's physical replication.

## Consequences

- N+1 sync targets per device (one directory poll over HTTP + one libSQL replica per Household). Acceptable at expected N (1–5 Households per User).
- No SQL-level joins across Households. Cross-Household views are application-level unions; this is fine for the intended UX.
- Creating a Household costs one Turso DB provisioning call (~hundreds of ms). Acceptable on a deliberate "create household" action; not in a hot path.
- Bootstrap returns 24-hour, per-Household DB auth tokens for active Members. Turso tokens cannot be retrieved after creation or revoked individually; removing a Member stops future token issuance immediately, while already-issued tokens expire. If immediate revocation becomes necessary, rotate all tokens for that Household DB and force remaining Members to re-bootstrap, or move writes behind server APIs.
- The first persisted Item implementation may write directly to the remote Household DB with a scoped token before local-first sync is wired. It may use initial load, optimistic local mutations, and manual refresh as a temporary simplification. Keep this behind an app-owned adapter so it can be replaced by true local replica sync without changing feature components.

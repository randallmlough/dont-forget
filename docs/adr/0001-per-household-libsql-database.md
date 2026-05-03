# Per-Household libSQL database, plus a server-only directory database

Households share Lists and Items across multiple Members' devices, with offline-first edits and seconds-scale eventual consistency. We use **one Turso (libSQL) database per Household**, replicated to each Member's device via the Turso React Native bindings, plus a single server-only **directory database** that holds `households`, `memberships`, and `invitations`. Users live in Clerk and are referenced by `clerk_user_id`.

## Considered alternatives

- **Single shared DB with `household_id` on every row.** Rejected: without Turso's not-yet-shipped partial sync, every device pulls every Household's data. Privacy and storage non-starter.
- **One DB per User, with the server replicating Household data into each User's DB.** Rejected: write amplification (a Member's edit must propagate via the server into every co-Member's per-User DB) and muddled conflict timing. Effectively rebuilds logical replication on top of Turso's physical replication.

## Consequences

- N+1 sync targets per device (one directory poll over HTTP + one libSQL replica per Household). Acceptable at expected N (1–5 Households per User).
- No SQL-level joins across Households. Cross-Household views are application-level unions; this is fine for the intended UX.
- Creating a Household costs one Turso DB provisioning call (~hundreds of ms). Acceptable on a deliberate "create household" action; not in a hot path.
- Removing a Member is implemented by revoking that Member's scoped Turso auth token, not by deleting rows. The Member's local replica is purged on next sync failure or directory poll.

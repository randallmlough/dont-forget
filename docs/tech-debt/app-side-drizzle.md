# Revisit Drizzle For App-Side Household Queries

## Context

The first op-sqlite Household sync milestone intentionally keeps the Active List adapter on raw SQL. The goal is to prove the native sync path, offline local writes, and Expo/iOS bundling behavior with the smallest possible runtime change.

Drizzle remains the app's schema and migration source for Household tables, but the server-migrated Turso Household DB is the schema authority. The app should not introduce bundled Household migrations just to use `drizzle-orm/op-sqlite`.

## Why This Is Debt

Raw SQL is acceptable while the app-side query surface is small. As Home grows beyond the current List/Item load, add, and checked-state queries, duplicating table and column knowledge in raw SQL will become easier to break during schema changes.

## Revisit When

- The op-sqlite Turso sync path has passed a native iOS proof.
- Offline cold start, local Item writes, and online sync recovery are covered by tests.
- The app-side Household query surface grows beyond the Active List adapter's current handful of statements.

## Desired Direction

Evaluate `drizzle-orm/op-sqlite` for app-side Household queries while preserving these constraints:

- Do not bundle or run Household schema migrations in the app.
- Do not import `@libsql/client` from app-side code.
- Keep server/API/migration Drizzle usage separate from native app runtime imports.
- Keep direct Household SQL behind app-owned data adapters so feature components do not depend on the database driver.

# Stage 2 Discussion: Directory Schema And Migration

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/implementation-handoff.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-switching.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-join-code-flow.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/invitation-flow.md`
- `docs/code-standards/architecture.md`
- `docs/how-things-work/testing.md`
- `db/schema/directory.ts`
- `db/fixtures/builders.ts`
- `db/fixtures/scenarios.ts`

## Stage Scope

This stage updates the directory DB schema and migrations to support active Household selection and reusable Household Join Codes. It also updates fixtures/builders so later service and API tests can use the new schema.

## Current State

- The directory DB has `users`, `households`, `memberships`, and `invitations`.
- `users` does not have `active_household_id`.
- `invitations` already has token, optional email, created/accepted/revoked fields.
- No reusable Household Join Code tables exist.
- Fixtures include Users, Households, Memberships, Invitations, Lists, Items, and `item_checks`, but no multi-Household active selection or Join Code fixtures.

## Stage Decisions

- Add `users.active_household_id` referencing `households.id`.
- Add `household_join_codes` with explicit lifecycle columns.
- Add `household_join_code_uses` for successful reusable-code audit rows.
- Add `household_join_code_attempts` keyed by `user_id` for failed manual code attempts.
- Enforce unique visible Join Code values.
- Enforce at most one active enabled Join Code per Household.
- Preserve the existing active Membership uniqueness rule.
- Do not add `invitations.code`.
- Do not store visible code strings in use audit rows.
- Do not store attempted code values in failed-attempt rows.

## Module Plan

- Directory schema module.
- Directory migration SQL and migration metadata.
- Fixture builders.
- Scenario helpers for multi-Household Users and Join Code state.
- Migration tests.

## Testing And Verification

- Migration tests should apply directory migrations to a temp DB.
- Schema tests should verify constraints for active Memberships, unique Join Codes, and one active enabled Join Code per Household.
- Fixture tests should prove new builders/scenarios insert valid rows.
- Integration tests should cover two different Users using the same active code without violating constraints.

## Out Of Scope

- Service methods that interpret the new tables.
- API handlers.
- UI.
- Email delivery.

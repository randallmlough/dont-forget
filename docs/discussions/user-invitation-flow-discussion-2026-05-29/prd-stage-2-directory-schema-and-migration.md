# PRD: User Invitation Flow Stage 2 - Directory Schema And Migration

## Problem Statement

The directory DB cannot yet store a User's active Household or model reusable Household Join Codes. Without durable schema support, later Invitation, join-code, and Household switching behavior would rely on temporary client state or overload the existing Invitation table.

## Solution

Add the directory DB schema and migration needed for active Household selection, reusable Household Join Code lifecycle, successful Join Code use audits, and failed manual code attempt tracking. Update fixtures so later stages can test these behaviors with real database state.

## User Stories

1. As a User, I want my active Household remembered by the app, so that switching Household is consistent across devices.
2. As a User, I want accepting an Invitation to make that Household active, so that I immediately see the Household I joined.
3. As a User, I want joining by Household code to make that Household active, so that the join flow lands in the right place.
4. As a Member, I want my Household to have one reusable Join Code, so that I can share it with another User.
5. As a Member, I want regenerated codes to invalidate old codes, so that an exposed code can be replaced.
6. As a Member, I want disabled codes to stop working, so that Household access can be paused.
7. As a maintainer, I want Join Code use audit rows, so that successful reusable-code joins can be inspected without storing visible code strings on every use.
8. As a maintainer, I want failed code attempts tracked without storing attempted codes, so that brute-force attempts are limited without retaining sensitive input.
9. As a developer, I want schema constraints for unique codes, so that collision retries are reliable.
10. As a developer, I want fixture support for multi-Household Users, so that service and API tests can exercise switching.
11. As a developer, I want fixture support for Join Codes, uses, and attempts, so that later tests do not hand-roll row setup.

## Implementation Decisions

- Add active Household selection as User-scoped directory state.
- Add a reusable Household Join Code table with lifecycle columns for creation, replacement, and disablement.
- Model active code as the newest row where replacement and disablement markers are empty.
- Add a use audit table that references the Join Code generation, Household, User, and Membership.
- Add a failed-attempt table keyed by User with compact window fields.
- Do not add a short code column to Invitations.
- Do not store visible code values in use audit rows.
- Do not store attempted code values in failed-attempt rows.
- Preserve active Membership uniqueness for each User and Household.
- Update fixture builders and scenarios for the new directory facts.

## Testing Decisions

- Use local temp directory DB integration tests loaded from checked-in migrations.
- Test that migrations apply cleanly from an empty directory DB.
- Test that visible Join Code values are unique.
- Test that only one active enabled Join Code can exist for a Household.
- Test that a User can still have active Memberships in multiple Households.
- Test that fixture builders and scenarios create valid schema state.
- Test constraints through real DB behavior rather than mocking persistence.

## Out of Scope

- Active Household service logic.
- Invitation service behavior.
- Household Join Code service behavior.
- API route handlers.
- Authenticated App Session bootstrap changes.
- UI flows.

## Further Notes

This stage should be implemented before services so the domain behavior can be expressed against durable database facts.

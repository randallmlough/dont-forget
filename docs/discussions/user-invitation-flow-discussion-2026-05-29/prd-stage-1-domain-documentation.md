# PRD: User Invitation Flow Stage 1 - Domain Documentation

Source: [GitHub Discussion #69](https://github.com/randallmlough/dont-forget/discussions/69)

## Problem Statement

The implementation plan introduces reusable Household Join Codes, new API route boundaries, and updated Invitation semantics. Without documentation first, implementation agents can confuse single-use Invitations with reusable Join Codes, place API logic in the wrong layer, or drift from Don't Forget's domain language.

## Solution

Update the project documentation before code changes. The docs will define **Household Join Code** as a first-class domain term, keep **Invitation** single-use and token-based, and document the API route boundary that later stages must follow.

## User Stories

1. As an implementation agent, I want Household Join Code to be defined in the glossary, so that I do not model it as a variant of Invitation.
2. As an implementation agent, I want Invitation documentation to stay single-use and token-based, so that I do not add reusable manual codes to Invitations.
3. As a maintainer, I want the API route boundary documented, so that app route files, API handlers, and services stay separated.
4. As a maintainer, I want status-code meanings documented, so that API behavior remains consistent across Invitation, Household Join Code, and Household switching routes.
5. As a developer, I want auth and error handling documented for API routes, so that public previews and authenticated mutations avoid leaking sensitive state.
6. As a developer, I want testing expectations documented with the API boundary, so that new handlers are integration-tested instead of mocked around.
7. As a future contributor, I want architecture standards linked to the API route guide, so that the new `lib/api` layer is discoverable.
8. As a maintainer, I want no replacement terminology introduced, so that Household, Member, User, Owner, List, Item, Invitation, and Household Join Code stay consistent.

## Implementation Decisions

- Add Household Join Code as a domain term for a reusable Household-scoped code and join URL that lets an authenticated User become a Member of a Household.
- Keep Invitation as token-based, single-use, 7-day expiring, and revocable.
- Document that reusable manual code entry belongs to Household Join Code, not Invitation.
- Document the API boundary as thin route adapters calling API handler modules, which call domain services.
- Document that API handler modules own HTTP parsing, auth verification, response shaping, and orchestration, while services own domain behavior and database access.
- Document that route wrappers lazy-load server-only handlers to preserve Expo native route registration safety.
- Document status-code policy for unavailable tokens/codes, throttling, missing auth, authorization failures, and true management conflicts.
- Link the API route guide from architecture standards.

## Testing Decisions

- This stage is documentation-only, so verification is by review and targeted search.
- Verify that Household Join Code appears as a distinct domain term.
- Verify that Invitation documentation remains single-use and token-based.
- Verify that the API route guide covers the required boundary, status codes, auth/error handling, and test expectations.
- Verify that no avoided replacement terms are introduced as canonical language.

## Out of Scope

- Directory DB schema and migrations.
- Server services.
- API route code.
- Authenticated App Session code.
- UI routes and screens.
- GitHub issue decomposition beyond this PRD.

## Further Notes

This stage intentionally comes first because the remaining stages depend on stable language and boundaries. It should not implement behavior.

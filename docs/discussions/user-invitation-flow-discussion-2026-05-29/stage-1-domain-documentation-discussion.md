# Stage 1 Discussion: Domain Documentation

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/full-discussion.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/implementation-handoff.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/api-service-and-session-contracts.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/household-join-code-flow.md`
- `docs/code-standards/architecture.md`
- `docs/how-things-work/routing.md`
- `docs/how-things-work/services.md`

## Stage Scope

This stage updates project documentation so future implementation stages have the correct domain language, architecture boundary, and API route expectations before schema or code changes begin.

## Current State

- `CONTEXT.md` defines **Invitation** as token-based, single-use, 7-day expiring, revocable, and delivered by email and/or shareable link.
- `CONTEXT.md` does not yet define **Household Join Code**.
- `docs/code-standards/architecture.md` already requires domain language, thin Expo API route files, lazy-loaded server services, and domain-first services.
- There is no dedicated `docs/how-things-work/api-routes.md` yet.

## Stage Decisions

- Add **Household Join Code** to the glossary as a reusable Household-scoped code/link distinct from **Invitation**.
- Keep **Invitation** documented as token-based, single-use, 7-day expiring, and revocable.
- Add a decisions-in-flight bullet for Household Join Codes.
- Keep the existing Invitation decision focused on single-use email/link tokens.
- Add an API routes document explaining the `app/api` -> `lib/api` -> `lib/services` boundary.
- Link the new API routes document from architecture standards.

## Module Plan

- Domain glossary documentation.
- Decisions-in-flight documentation.
- API route architecture documentation.
- Architecture standards cross-link.

## Testing And Verification

- Documentation review should verify that project language remains **Household**, **Member**, **Owner**, **User**, **List**, **Item**, **Invitation**, and **Household Join Code**.
- Search should confirm no new avoided terms are introduced as replacements for domain language.
- The API route document should explicitly cover status codes, auth/error handling, lazy route wrappers, `lib/api`, services, and testing expectations.

## Out Of Scope

- Database schema changes.
- Service implementation.
- API route implementation.
- UI changes.

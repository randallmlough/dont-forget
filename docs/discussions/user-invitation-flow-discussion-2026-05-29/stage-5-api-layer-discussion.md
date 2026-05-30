# Stage 5 Discussion: API Layer

Source documents:

- `CONTEXT.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/api-service-and-session-contracts.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/auth-redirect-and-public-routes.md`
- `docs/discussions/user-invitation-flow-discussion-2026-05-29/testing-security-and-analytics.md`
- `docs/code-standards/architecture.md`
- `docs/how-things-work/services.md`
- `app/api/bootstrap+api.ts`
- `lib/server/auth.ts`

## Stage Scope

This stage adds `lib/api` handlers and thin Expo API route wrappers for Invitation, Household Join Code, Household switching, Members, and management routes.

## Current State

- The app has `app/api/bootstrap+api.ts`.
- The bootstrap route lazy-loads server-only imports inside the handler.
- There is no `lib/api` layer yet.
- Current API route coverage verifies bootstrap route registration does not load server-only dependencies too early.

## Stage Decisions

- Add `lib/api` as the server-only HTTP boundary.
- Keep `app/api/**/+api.ts` files as thin lazy-loading adapters.
- `lib/api` parses requests, verifies auth, shapes responses, and calls services.
- Services own domain behavior and DB access.
- Tests may import `lib/api` directly.
- App/client code must not import `lib/api`.
- Add ESLint guardrails for the `lib/api` boundary.
- Use generic errors for unavailable tokens/codes.
- Use documented status-code policy.

## Module Plan

- API handler modules.
- Thin Expo API route wrappers.
- Shared API request/response schemas where appropriate.
- API test helpers under `lib/test/api`.
- ESLint boundary rule.

## Testing And Verification

- Handler tests should use real directory DB behavior and injected dependencies.
- Route registration tests should prove API wrappers do not eagerly import server-only modules.
- Tests should cover 401, 403, 404, 409, and 429 behavior where relevant.
- Tests should assert generic unavailable responses.
- Tests should assert response shapes for accept/join/switch and management endpoints.

## Out Of Scope

- UI screens.
- Service internals already covered by Stage 3.
- Auth redirect policy UI behavior.

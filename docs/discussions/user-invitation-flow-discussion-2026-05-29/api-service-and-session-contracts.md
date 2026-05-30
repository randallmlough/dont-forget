# API, Service, And Session Contracts

Source: `full-discussion.md`

## Architecture Boundary

Add a dedicated `lib/api/` location for API handler functionality.

Boundary:

```txt
app/api/**/+api.ts -> lib/api/** -> lib/services/**
```

Responsibilities:

- `app/api/**/+api.ts`: thin routing adapters that lazy-load server-only handlers inside HTTP method functions.
- `lib/api/**`: server-only HTTP boundary code for request parsing, auth verification, response shaping, and handler orchestration.
- `lib/services/**`: domain behavior, database access, and business rules.

`lib/api` must not become a second data-access layer.

API request/response schemas live in `lib/api/**` when they are HTTP-boundary concerns. If a response schema must be parsed by client code, place the shared schema in an app-safe module instead of server-only `lib/api`.

`lib/api` handlers may return `Response` objects directly because they are HTTP boundary modules, but they should remain dependency-injectable and testable.

## Import Guardrails

Add a custom ESLint boundary rule following the existing `tools/eslint-rules` pattern:

- app/client-facing code must not import `@/lib/api` or relative paths resolving into `lib/api`;
- `app/api/**/+api.ts` route files should lazy-load `lib/api` handlers inside HTTP method functions rather than statically importing them;
- tests may import `lib/api` directly.

## Status Codes

Document status-code meanings in `docs/how-things-work/api-routes.md`.

Initial policy:

- `404`: unavailable Invitation tokens or Household codes, with generic user-facing messages.
- `429`: too many join-code attempts.
- `401`: missing or invalid auth on mutation routes.
- `403`: authenticated User trying to manage a Household they are not an active Member of.
- `409`: true management state conflicts only, not token/code guessing outcomes.

## Route Contracts

Household switching:

```http
PATCH /api/users/me/active-household
```

Body:

```json
{ "householdId": "..." }
```

Invitation accept:

```http
POST /api/invitations/accept
```

Body:

```json
{ "token": "..." }
```

Household Join Code join:

```http
POST /api/households/join-code/join
```

Body:

```json
{ "code": "ABCDEFGH" }
```

Invitation creation:

```http
POST /api/invitations
```

Body:

```json
{ "householdId": "...", "email": "optional@example.com" }
```

Household settings:

```http
GET /api/households/:householdId/members
GET /api/households/:householdId/invitations
PATCH /api/invitations/:invitationId
```

Invitation revoke body:

```json
{ "revoked": true }
```

Household Join Code management:

```http
GET /api/households/:householdId/join-code
POST /api/households/:householdId/join-code/regenerate
PATCH /api/households/:householdId/join-code
```

Enable/disable body:

```json
{ "enabled": true }
```

Public preview endpoints should be `GET` routes. Exact implementation paths can be chosen during implementation, but the agreed shapes are:

```ts
{ available: true, householdName: string, inviterDisplayName: string }
| { available: false }
```

for Invitation preview, and:

```ts
{ available: true, householdName: string } | { available: false }
```

for Household Join Code preview.

## Authenticated App Session Changes

Add `users.active_household_id` in the directory DB.

Bootstrap behavior:

- prefer `users.active_household_id` when it still points to an active Membership for the User;
- repair invalid/null active Household selection using the deterministic oldest active Membership fallback;
- create a first-run Household only when the User has no active Memberships.

Bootstrap response adds:

```ts
households: Array<{
  id: string;
  name: string;
  role: "owner" | "member";
  isActive: boolean;
}>
```

Keep existing active Household fields too.

## `reloadSession`

Add provider-level action:

```ts
reloadSession: () => void
```

Accept, join, and switch screens call their server endpoint, then call `reloadSession`.

Screens must not manually bootstrap, open Household stores, replace resources, or dispose session resources. The Authenticated App Session controller owns resource replacement and retires the previous Household resource set using existing replacement policy.

## Link Generation

Server services generate Invitation and Household join links using server-side config:

```txt
PUBLIC_APP_BASE_URL
```

Examples:

```txt
${PUBLIC_APP_BASE_URL}/invitations/accept?token=...
${PUBLIC_APP_BASE_URL}/households/join?code=ABCDEFGH
```

This is distinct from `EXPO_PUBLIC_API_BASE_URL`.

Operations that need to return or email links should fail fast if `PUBLIC_APP_BASE_URL` is missing, unless tests inject deterministic link config.

Inject an app link builder into server services:

```ts
invitationAcceptUrl(token)
householdJoinUrl(code)
```

Inject token/code generators for deterministic tests. Production generators use secure randomness and rely on uniqueness constraints plus bounded retries for collisions.

## Documentation Updates

Implementation should add:

- `docs/how-things-work/api-routes.md`;
- architecture standards link to the API routes doc;
- `CONTEXT.md` glossary entry for **Household Join Code**;
- updated `CONTEXT.md` Invitation decision clarifying single-use token semantics.

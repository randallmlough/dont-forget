# API Routes

Expo API Routes are the HTTP boundary for server behavior. Keep them thin so native route registration stays safe and domain behavior stays in services.

## Boundary

Use this flow for API behavior:

```txt
app/api/**/+api.ts -> lib/api/** -> lib/services/**
```

Responsibilities:

- `app/api/**/+api.ts` exports HTTP method functions and lazy-loads server-only API handlers inside those functions.
- `lib/api/**` parses requests, verifies auth, shapes HTTP responses, maps expected domain errors to status codes, and orchestrates service calls.
- `lib/services/**` owns domain behavior, database access, Membership checks, Invitation behavior, Household Join Code behavior, and active Household selection.

`lib/api` is not a data-access layer. If an API handler needs directory DB or Household DB access, call the appropriate service instead of adding SQL to the handler.

Request and response schemas can live in `lib/api/**` when they are only HTTP-boundary contracts. Put schemas in an app-safe module only when client code must parse the same shape.

## Legacy Exception

`app/api/bootstrap+api.ts` predates the `lib/api` boundary and still lazy-loads auth, directory DB, and `lib/services/session/server` directly. Do not copy that shape into new routes.

When the Authenticated App Session bootstrap route is next changed for API-boundary work, move its HTTP parsing, auth/error handling, response shaping, and service orchestration into `lib/api` first. Until then, treat bootstrap as the only documented exception to the `app/api` -> `lib/api` -> `lib/services` flow.

## Route Wrappers

Route files under `app/api` must lazy-load server-only code inside the HTTP method function:

```ts
export async function POST(request: Request): Promise<Response> {
  const { handleInvitationAccept } = await import("@/lib/api/invitations/accept");

  return handleInvitationAccept(request);
}
```

Avoid static imports from `lib/api`, server services, directory DB clients, Clerk server SDKs, Turso platform clients, or Resend in route files. Tests may import `lib/api` handlers directly.

## Auth And Errors

Public preview routes may expose only minimal availability context:

- Invitation preview: whether it is available, Household name, and inviter display name or non-email fallback.
- Household Join Code preview: whether it is available and Household name.

Authenticated mutations must verify the signed-in User before calling services. Household-scoped management routes must also verify that the User is an active Member of that Household.

Unavailable Invitation tokens and Household Join Codes must use generic user-facing messages. Do not reveal whether an Invitation token never existed, expired, was revoked, was accepted, or belonged to another Household. Do not reveal whether a Household Join Code never existed, was disabled, was regenerated, or belongs to another Household.

Expected validation, unavailable, throttled, and authorization outcomes should be returned as shaped HTTP responses. Unexpected operational failures should be logged once at the API boundary or service boundary with useful non-sensitive context, then returned as a generic server failure.

## Status Codes

Use these status-code meanings consistently across Invitation, Household Join Code, Household switching, Member, and Household management routes:

| Status | Meaning |
| --- | --- |
| `200` | Successful read or idempotent mutation. |
| `201` | Successful creation when the response represents a newly created domain record. |
| `400` | Malformed JSON or request fields that cannot be parsed. |
| `401` | Missing or invalid auth on authenticated routes. |
| `403` | Authenticated User is not an active Member authorized for the target Household management action. |
| `404` | Unavailable Invitation token or Household Join Code, returned with generic copy. |
| `409` | True management state conflict, not token or code guessing outcomes. |
| `429` | Too many Household Join Code attempts. |
| `500` | Unexpected server failure with no sensitive details in the response. |

Generic user-facing copy:

```txt
This Invitation is no longer available.
This Household code is not available.
Too many attempts. Try again later.
```

## Current Route Contracts

Household switching:

```http
PATCH /api/users/me/active-household
```

```json
{ "householdId": "..." }
```

Invitation accept:

```http
POST /api/invitations/accept
```

```json
{ "token": "..." }
```

Household Join Code join:

```http
POST /api/households/join-code/join
```

```json
{ "code": "ABCDEFGH", "source": "manual_code" }
```

`source` is optional and defaults to `manual_code`. Public join links send
`join_link`.

Invitation creation:

```http
POST /api/invitations
```

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

Enable or disable body:

```json
{ "enabled": true }
```

Public preview routes should be `GET` routes. Exact paths are implementation-level, but response shapes should stay:

```ts
{ available: true, householdName: string, inviterDisplayName: string }
| { available: false }
```

for Invitation preview, and:

```ts
{ available: true, householdName: string } | { available: false }
```

for Household Join Code preview.

## Analytics

Track product outcomes at the service or API boundary that knows the outcome happened. Keep event names domain-oriented:

- `invitation_created`
- `invitation_revoked`
- `invitation_accepted`
- `household_join_code_regenerated`
- `household_join_code_disabled`
- `household_join_code_enabled`
- `household_join_code_used`
- `household_switched`

Analytics properties must be safe and minimal. Include Household, Member role, or source context only when useful. Never include email addresses, visible Household Join Codes, Invitation tokens, or other bearer secrets.

## Testing

Test `lib/api` handlers directly where practical, with real directory DB behavior and injected dependencies for external services such as email delivery. Keep route-wrapper tests focused on native registration safety and lazy-loading behavior.

API coverage should include:

- auth required on authenticated mutations;
- active-Member authorization for Household-scoped management;
- generic unavailable errors;
- status-code policy;
- response shapes;
- Invitation email delivery status behavior;
- no server-only imports during route registration for Expo API route wrappers.

Shared API test helpers should live under `lib/test/api/` and should stay minimal until duplication proves a helper is needed.

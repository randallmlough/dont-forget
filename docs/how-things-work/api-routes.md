# API Routes

The standalone Hono Node API is the HTTP boundary for server behavior. Keep route composition and handlers thin so domain behavior stays in services.

## Boundary

Use this flow for API behavior:

```txt
apps/api/src/app.ts -> apps/api/src/<domain>/api.ts -> same-domain services
```

Responsibilities:

- `apps/api/src/app.ts` creates the Hono app and statically registers each method/path with its domain handler.
- `apps/api/src/<domain>/api.ts` parses requests, verifies auth, shapes HTTP responses, maps expected domain errors to status codes, and orchestrates service calls.
- Same-domain server services own domain behavior, database access, Membership checks, Invitation behavior, Household Join Code behavior, and active Household selection.

API handlers are not a data-access layer. If a handler needs directory or product data access, call the appropriate service instead of adding SQL to the handler.

The PowerSync write endpoint `/api/data` is deliberately split. `apps/api/src/data/` owns HTTP auth, bounded payload parsing, rate limiting, transaction orchestration, and response mapping. The batch contract, write applicator, allow-lists, and Postgres transaction live under `packages/db/src/sync/` and are consumed through `@dont-forget/db` ([ADR-0016](../adr/0016-data-write-applicator-in-db-layer.md), [ADR-0014](../adr/0014-db-layer-owns-data-store-infrastructure.md)). The applicator is a generic, schema-agnostic write engine for the sync transport, not a domain service.

Request and response schemas can live with the API handler when they are only HTTP-boundary contracts. Put cross-workspace schemas in `packages/shared/src/contracts/` and export them through `@dont-forget/shared` when mobile or web code must parse the same shape.

## Hono Composition

Register routes in `apps/api/src/app.ts` and pass the raw `Request` plus explicit dependencies to the owning handler:

```ts
const app = new Hono();
app.post("/api/bootstrap", (context) =>
  handleBootstrap(context.req.raw, { directory: deps.directory }),
);
```

Keep registration mechanical. Domain handlers own request parsing and response policy; same-domain services own domain behavior and directory DB access. Import API internals with `@api/*`. Consume shared and DB packages only through declared/exported `@dont-forget/*` entrypoints.

## Auth And Errors

Public preview routes may expose only minimal availability context:

- Invitation preview: whether it is available, Household name, and inviter display name or non-email fallback.
- Household Join Code preview: whether it is available and Household name.

Authenticated mutations must verify the signed-in User before calling services. Household-scoped management routes must also verify that the User is an active Member of that Household.

Unavailable Invitation tokens and Household Join Codes must use generic user-facing messages. Do not reveal whether an Invitation token never existed, expired, was revoked, was accepted, or belonged to another Household. Do not reveal whether a Household Join Code never existed, was disabled, was regenerated, or belongs to another Household.

Expected validation, unavailable, and authorization outcomes should be returned as shaped HTTP responses. Unexpected operational failures should be logged once at the API boundary or service boundary with useful non-sensitive context, then returned as a generic server failure.

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
| `500` | Unexpected server failure with no sensitive details in the response. |

Generic user-facing copy:

```txt
This Invitation is no longer available.
This Household code is not available.
```

## Current Route Contracts

PowerSync write upload:

```http
POST /api/data
```

The PowerSync connector's `uploadData` posts a batch of the client's queued local writes:

```json
{ "ops": [{ "op": "PUT", "table": "items", "id": "...", "data": {} }] }
```

Each op is `PUT` (upsert), `PATCH` (partial update), or `DELETE` (tombstone) keyed
on a synthetic row `id`. Auth is the Clerk session bearer token, verified sub-only
(`verifyToken` → `clerk_user_id → users.id`). The applicator enforces per-row
Household-membership authorization, a per-table/column allow-list, tombstone
monotonicity, and an `updated_at` clamp, then applies the whole batch in one
transaction (see [ADR-0016](../adr/0016-data-write-applicator-in-db-layer.md),
[ADR-0018](../adr/0018-single-postgres-self-hosted-powersync.md)). The connector
treats `4xx` as terminal (discard the op) and `5xx`/network as transient (retry),
so a permanently-rejected write cannot jam the upload queue.

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
PATCH /api/households/:householdId
GET /api/households/:householdId/members
GET /api/households/:householdId/invitations
PATCH /api/invitations/:invitationId
```

Household rename body:

```json
{ "name": "Lake House" }
```

Household rename response:

```json
{ "household": { "id": "...", "name": "Lake House" } }
```

Only Owners can rename a Household. Invalid names return `400`, unauthorized
requests return `401`, non-Owners and non-Members return `403`, and deleted
Households return `404` for existing Owners.

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
- `household_renamed`

Analytics properties must be safe and minimal. Include Household, Member role, or source context only when useful. Never include email addresses, visible Household Join Codes, Invitation tokens, or other bearer secrets.

## Testing

Test `apps/api/src/<domain>/api.ts` handlers directly where practical, with real directory DB behavior and injected dependencies for external services such as email delivery. Current examples include `apps/api/src/bootstrap/api.test.ts`, `apps/api/src/data/api.test.ts`, `apps/api/src/households/api.test.ts`, `apps/api/src/invitations/api.test.ts`, and `apps/api/src/users/api.test.ts`. `apps/api/src/app.test.ts` proves Hono route registration and delegation.

API coverage should include:

- auth required on authenticated mutations;
- active-Member authorization for Household-scoped management;
- generic unavailable errors;
- status-code policy;
- response shapes;
- Invitation email delivery status behavior;
- Hono route registration and handler delegation.

Shared API test helpers live under `apps/api/src/test/api/` and should stay minimal until duplication proves a helper is needed.

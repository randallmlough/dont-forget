# Implementation Handoff

Source: `full-discussion.md`

## Status

The discussion is complete for implementation handoff. Open questions: none.

Build this backend/session-first. Do not start with UI polish; the UI depends on directory DB state, server services, API contracts, and Authenticated App Session reload behavior.

## Implementation Order

1. Update domain documentation.
2. Add directory schema and migration.
3. Add server services.
4. Extend Authenticated App Session.
5. Add `lib/api` handlers and thin Expo API route wrappers.
6. Add database integration tests before UI.
7. Build UI on stable contracts.

## 1. Domain Documentation

Update `CONTEXT.md`:

- add **Household Join Code** as a reusable Household-scoped code/link distinct from single-use **Invitation**;
- keep **Invitation** documented as token-based, single-use, 7-day expiring, and revocable;
- add a separate decisions-in-flight bullet for Household Join Codes;
- keep the Invitations decision focused on single-use email/link tokens.

Add:

```txt
docs/how-things-work/api-routes.md
```

Link it from `docs/code-standards/architecture.md`.

The API routes doc should cover:

- `app/api` thin wrappers;
- `lib/api` boundary;
- service boundaries;
- auth/error handling;
- status codes;
- API testing expectations.

## 2. Directory Schema And Migration

Add:

- `users.active_household_id`;
- `household_join_codes`;
- `household_join_code_uses`;
- `household_join_code_attempts`.

Enforce:

- unique visible Join Code values;
- at most one active enabled Join Code per Household;
- no duplicate active Membership for the same User and Household.

When an initial Household is created, create its reusable Household Join Code.

## 3. Server Services

Add services for:

- active Household selection and validation;
- Invitation create, preview, accept, list, and revoke;
- Household Join Code preview, join, get current code, regenerate, disable, and enable;
- app link generation;
- injected token/code/email dependencies.

Services own domain behavior and database access. `lib/api` should parse HTTP/auth and call services.

## 4. Authenticated App Session

Bootstrap should:

- prefer valid `users.active_household_id`;
- repair invalid/null active Household selection with the deterministic Membership fallback;
- return all active Households for the User;
- create first-run Household only when the User has no active Memberships.

Bootstrap response adds:

```ts
households: Array<{
  id: string;
  name: string;
  role: "owner" | "member";
  isActive: boolean;
}>
```

Provider adds:

```ts
reloadSession: () => void
```

Accept, join, and switch screens call server mutation endpoints, then `reloadSession`.

## 5. API Layer

Add `lib/api/` as a server-only HTTP boundary.

Keep `app/api/**/+api.ts` as thin wrappers that lazy-load `lib/api` handlers inside HTTP method functions.

Add ESLint guardrails:

- app/client code cannot import `lib/api`;
- API route files lazy-load `lib/api`, not statically import it;
- tests may import `lib/api` directly.

Use the route contracts from `api-service-and-session-contracts.md`.

## 6. Tests

Use database integration tests for services and `lib/api` handlers.

Add only the smallest shared API test helper needed by the first handler tests under:

```txt
lib/test/api/
```

Mock or inject external email delivery.

Add fixtures for:

- multi-Household Users;
- active Household selection;
- Household Join Codes;
- Join Code uses;
- Join Code attempts;
- Invitation variants.

## 7. UI

Build UI after backend/session/API contracts are stable.

Screens/routes:

- Household settings page with Member list, Invitation management, and reusable Household Join Code controls.
- Household switch page with Household list, current badge, switch action, and "Join Household with Code".
- Public Invitation accept route.
- Public Household Join Code route.

Important UI behavior:

- switching syncs the current Household first;
- failed sync blocks switching and keeps current Household active;
- Invitation accept and Join Code flows preserve through sign-in/sign-up;
- successful accept/join/switch reloads the Authenticated App Session;
- previous Household Membership remains active after switching.

## Deferred

QR code remains a fast follow. It should render the appropriate public join/accept URL after link and code flows are stable.

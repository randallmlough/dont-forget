# Creating a Domain Service

## Purpose

Use this guide to create or change one domain service under `src/client/features/<feature>/` or `src/server/<domain>/`.

A service is the product data boundary for a domain such as Household, List, Item, Member, User, or Invitation. Services own SQL/database access and return domain-shaped records. Screens, reusable components, and hooks must not query databases directly.

## Before you start

Read:

- `CONTEXT.md` for domain language.
- `docs/code-standards/architecture.md` for service-layer rules.
- `docs/how-things-work/services.md` for current service boundaries.
- `docs/adr/0011-domain-first-service-layer.md` for the domain-first service decision.
- `docs/how-things-work/analytics.md` and `docs/how-things-work/logging.md` if the service emits product events or diagnostic logs.

Confirm the existing pattern in nearby services before editing, for example:

- `src/client/features/list/list-service.ts`
- `src/client/features/list/item-service.ts`
- `src/server/users/user-service.ts`
- `src/server/households/member-service.ts`
- `src/server/households/household-service.ts`

## Files and naming

### Client product services

Use this shape for client product services:

```text
src/client/features/<feature>/
  <domain>-service.ts
  <domain>-service.test.ts
```

Examples:

- `src/client/features/list/list-service.ts`
- `src/client/features/list/item-service.ts`

### Server-only services

Use `src/server/<domain>/` for services that import server-only dependencies, directory DB infrastructure, Clerk backend helpers, the server Postgres client, Resend, or operator secrets:

```text
src/server/<domain>/
  <domain>-service.ts
  <domain>-service.test.ts
```

Examples:

- `src/server/users/user-service.ts`
- `src/server/households/member-service.ts`
- `src/server/households/household-service.ts`

Do not add broad root barrels that mix unrelated domains or client/server surfaces.

## Service shape

Start with the smallest service that owns one domain boundary:

```ts
export type Example = {
	id: string;
	householdId: string;
	name: string;
};

export type CreateExampleInput = {
	householdId: string;
	name: string;
};

export type ExampleService = {
	createExample(input: CreateExampleInput): Promise<Example>;
};

export type ExampleServiceDeps = {
	// App-safe product data uses the ProductDatabase seam.
	// Server-only directory data uses DirectoryDb or a transaction type.
};

export function createExampleService(deps: ExampleServiceDeps): ExampleService {
	return {
		async createExample(input) {
			// service-owned data access
		},
	};
}
```

Keep the public types named for the domain:

- `<Domain>Service`
- `<Domain>ServiceDeps`
- `create<Domain>Service`
- explicit input/output types for public methods

## Recipe

1. **Choose the owning domain folder.**
   - Use existing domains when the operation naturally belongs there.
   - Create a new folder only when the domain is genuinely new.
   - Current expected domains include `auth`, `household`, `invitation`, `item`, `list`, `member`, and `user`.

2. **Choose client or server placement.**
   - Client product services may depend on app-safe interfaces such as the `ProductDatabase` seam.
   - Server-only services go under `src/server/<domain>/`.

3. **Define domain-shaped return types.**
   - Return Household, Member, User, List, Item, or Invitation concepts.
   - Do not return raw SQL rows, Drizzle internals, or UI component props.

4. **Define an explicit dependency type.**
   - Client product reads/writes should use the narrow `ProductDatabase` seam (`ProductQuery<T>` / `writeTransaction()`).
   - Server services should receive `DirectoryDb` or a transaction-compatible type.
   - Add `logger?: Logger` only when the service logs.
   - Add a scoped analytics dependency only when the service owns a product outcome.

5. **Keep IDs and timestamps inside the service.**
   - Generate new app IDs inside the service with `createAppId(...)`.
   - Let services own timestamp generation with `Date.now()`.
   - Tests that need deterministic timestamps can spy on `Date.now()` at the test boundary.

6. **Validate external or SQL row boundaries.**
   - Use Zod for untrusted API responses, persisted payloads, or SQL rows whose shape is not already narrowed by Drizzle.
   - Prefer helper schemas such as `sqlNumberSchema` from `src/shared/sql.ts` when adapting client SQL values.

7. **Log once at the service boundary.**
   - Bind safe context with `.with({ household_id, service: "<domain>" })`.
   - Pass raw errors as `{ error: asError(error) }` or `{ error }` according to the local pattern.
   - Do not duplicate the same error log in the screen and service unless each layer adds different context.

8. **Emit analytics only after success.**
   - Add the event to `src/shared/analytics-events.ts` first.
   - Track after the local write or product outcome succeeds.
   - Do not track exploratory diagnostics or validation failures as analytics events.

9. **Update callers through the owning boundary.**
    - Screens/components should consume a provider, data source, hook, or service-composed boundary.
    - UI should not import database clients, Drizzle schemas for data access, or stores directly.

## Tests and verification

Add or update a focused service test next to the service:

```text
src/client/features/<feature>/<domain>-service.test.ts
src/server/<domain>/<domain>-service.test.ts
```

Test the service contract, not implementation details:

- successful domain read/write;
- missing/tombstoned records when relevant;
- generated ID shape rather than exact generated IDs;
- timestamp behavior with a `Date.now()` spy only when needed;
- analytics/logging through injected test dependencies;
- error behavior at the service boundary.

Use focused checks while iterating:

```bash
pnpm exec jest --runInBand --runTestsByPath src/client/features/list/list-service.test.ts
pnpm exec jest --runInBand --runTestsByPath src/server/households/household-service.test.ts
make eslint-rules
make typecheck
```

Before handoff:

```bash
make format
make verify
```

## Review checklist

- Uses `CONTEXT.md` domain language.
- Lives under the correct `src/client/features/<feature>/` or `src/server/<domain>/` path.
- Uses `create<Domain>Service`, `<Domain>Service`, and `<Domain>ServiceDeps` names.
- Does not add a broad root service barrel.
- Does not cross the client/server boundary.
- Keeps SQL/database access inside service implementation.
- Returns domain-shaped records, not raw rows or UI props.
- Generates IDs and timestamps inside the service.
- Injects logger/analytics only when the service owns those outcomes.
- Has focused tests and passes `make format` plus `make verify`.

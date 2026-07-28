# Adding an Analytics Event or Logger Contract

## Purpose

Use this guide when a change needs either:

- a typed product analytics event; or
- diagnostic logging with safe, searchable context.

Analytics and logs are different contracts. Analytics is a curated product-event vocabulary. Logging is operational evidence for debugging.

## Before you start

Read:

- `CONTEXT.md` for domain language.
- `docs/code-standards/architecture.md` for observability rules.
- `docs/how-things-work/analytics.md` for product analytics policy.
- `docs/how-things-work/logging.md` for diagnostic logging policy.
- `docs/adr/0004-pluggable-logger-abstraction.md` and `docs/adr/0005-pluggable-analytics-abstraction.md` for the abstraction decisions.

Inspect current contracts:

- `src/shared/analytics-events.ts`
- `src/client/lib/analytics.ts`
- `src/client/lib/logger.ts`
- `src/test/mocks/analytics.ts`
- `src/test/mocks/logger.ts`

## Choose analytics or logging

Use analytics when the event is a curated product outcome that may belong in funnels or dashboards, such as a User signing in, a Household Session loading, or an Item being added.

Use logging when the record is diagnostic, exploratory, error-oriented, or not worth a stable schema.

If you are tempted to invent an analytics event without editing `src/shared/analytics-events.ts`, use a log instead.

## Adding an analytics event

1. **Add the event to `EventMap`.**

   Edit `src/shared/analytics-events.ts`:

   ```ts
   export type EventMap = {
   	// existing events...
   	list_created: {
   		household_id: string;
   		list_id: string;
   		user_id: string;
   	};
   };
   ```

2. **Name the event and properties consistently.**
   - Event names use `snake_case`, lowercase, past tense, subject-first names.
   - Property names use `snake_case`.
   - Prefer literal unions over open strings.
   - Include safe domain IDs such as `household_id`, `list_id`, `item_id`, `user_id`, or `invitation_id` when useful.
   - Do not include Item names, secrets, tokens, passwords, auth headers, or unnecessary personal data.

3. **Call `track(...)` at the action boundary that knows the outcome.**

   ```ts
   import { track } from "@/client/lib/analytics";

   track("list_created", {
   	household_id: householdId,
   	list_id: listId,
   	user_id: userId,
   });
   ```

4. **Track only after success.**
   - For local-first Item/List writes, track after the local write commits.
   - Do not make sync success part of a local product event unless the product outcome truly depends on sync.
   - Do not track expected validation failures as product events.

5. **Inject analytics into services/stores that own product outcomes.**

   ```ts
   import { track } from "@/client/lib/analytics";

   type ExampleServiceAnalytics = {
   	track: typeof track;
   };

   export type ExampleServiceDeps = {
   	analytics?: ExampleServiceAnalytics;
   };
   ```

   This keeps service tests from mocking the global analytics module when an explicit dependency is cleaner.

## Adding diagnostic logging

1. **Use the logger abstraction.**
   - React code uses `useLogger()`.
   - Services/stores accept `logger?: Logger` when they log.
   - Other non-React utilities may use the `logger` singleton when no caller-owned seam exists.

2. **Bind safe context once.**

   ```ts
   const log = (deps.logger ?? defaultLogger).with({
   	household_id: deps.householdId,
   	service: "item",
   });
   ```

3. **Use short, stable messages.**
   - Lowercase, present tense, no IDs interpolated into the message.
   - Put IDs and counts in attributes.

4. **Pass raw errors under `error`.**

   ```ts
   try {
   	await saveItem();
   } catch (error) {
   	log.error("item save failed", { error, item_id: itemId });
   	throw error;
   }
   ```

5. **Log expected and unexpected states differently.**
   - Unexpected operation failures should be logged at the boundary with useful context.
   - Expected validation or user-correctable states should not be logged as errors.
   - Avoid logging and rethrowing at multiple layers unless each layer adds meaningful context.

## Tests and verification

For analytics changes:

- Add or update tests for important product funnels, auth flows, Household Session behavior, Invitation flows, or destructive actions.
- Use injected analytics dependencies in service/store tests when possible.
- For UI/screen code that imports global helpers directly, use the existing module mock pattern.

Focused examples:

```bash
pnpm exec jest --runInBand --runTestsByPath src/client/features/item/item-service.test.ts
pnpm exec jest --runInBand --runTestsByPath src/client/session/provider.test.tsx
```

For logging changes:

- Assert diagnostic message and safe context shape when logging is part of the contract.
- Mock logging sinks in tests to avoid noisy expected error output.
- Do not make tests brittle around incidental debug/info logs.

Before handoff:

```bash
make typecheck
make format
make verify
```

## Review checklist

- Analytics was chosen only for a stable product outcome.
- Logs were chosen for diagnostic or exploratory evidence.
- New analytics events are declared in `src/shared/analytics-events.ts` before call sites.
- Event and property names are `snake_case` and domain-shaped.
- Event properties contain no secrets or unnecessary personal data.
- Analytics fires after the successful product outcome.
- Logger calls use `src/client/lib/logger.ts`, not PostHog directly.
- Logger attributes use safe domain context and raw `{ error }` values.
- Service/store tests use injected analytics/logger dependencies when that is the cleaner seam.
- Focused tests, `make typecheck`, `make format`, and `make verify` pass.

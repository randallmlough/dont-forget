# Logging

Diagnostic logging goes through `lib/logger.ts`. Calls fan out to PostHog Logs in production and mirror to `console` in `__DEV__`. The provider is hidden behind an adapter — see [ADR-0004](../adr/0004-pluggable-logger-abstraction.md) for why.

## Logs vs events — pick the right one

| Use the logger when… | Use `posthog.capture(...)` when… |
|---|---|
| Recording diagnostic info to debug a future problem | Recording a product event for funnels / dashboards |
| The shape of the data is exploratory or one-off | The event has a curated name and stable schema |
| You're inside an error path or unexpected branch | You're tracking user behavior milestones |

If you're tempted to `posthog.capture("debug_thing_happened", {...})`, that's a log — use `logger.info`. Events should be a small, named vocabulary.

## Quick reference

```ts
// React (component, hook, screen) — auto-binds Clerk user_id
import { useLogger } from "@/lib/logger";
const log = useLogger();
log.info("list synced", { item_count: 42 });

// Services/stores — receive the logger from deps or open config
import { logger as defaultLogger, type Logger } from "@/lib/logger";
type ItemServiceDeps = { logger?: Logger };
const serviceLog = (deps.logger ?? defaultLogger).with({ service: "item" });

// Other non-React utilities without a caller-owned seam
import { logger } from "@/lib/logger";
logger.warn("token cache read failed", { key, error });

// Scoped child logger — binds attributes for every subsequent call
const opLog = log.with({ household_id, list_id });
opLog.error("item save failed", { error: e, item_id });
```

Four levels, in order of severity:

| Level | Use for |
|---|---|
| `debug` | Verbose detail you'd only want while diagnosing — e.g. cache hit/miss, intermediate state. |
| `info` | Normal app events worth recording — e.g. "list synced", "invitation sent". |
| `warn` | Something unexpected but recoverable — e.g. "token cache read failed; falling back to network", "sync took 8s". |
| `error` | An operation failed. Always include the underlying `error` in attributes. |

`trace` and `fatal` (which PostHog supports) are intentionally not exposed.

## Conventions

**Message** — short, lowercase, present tense, no trailing punctuation. The "what happened" in 2–6 words. Don't interpolate IDs into the message; put them in attributes.

```ts
//  good
log.warn("sync slow", { duration_ms: 8200, list_id });

//  bad — id baked into message kills grep / aggregation
log.warn(`sync of list ${listId} took 8200ms`);
```

**Attribute keys** — `snake_case`, matching PostHog / OTLP convention. Be consistent so log queries work across call sites:

- `user_id`, `household_id`, `list_id`, `item_id`, `invitation_id`
- `duration_ms` (not `time` or `elapsed`)
- `error` (the raw `Error` instance — see below)
- `count`, `item_count`, etc.

**Don't log in tight loops or per-render paths.** PostHog batches, but each call still allocates and runs through the adapter. If you're tempted to log every `useEffect` tick, you probably want a single log on the meaningful state transition instead.

## Errors

Pass the raw `Error` instance under the `error` key. The adapter flattens it into `error_message`, `error_name`, `error_stack`, and `error_cause` so the fields survive serialization and search.

```ts
try {
  await acceptInvitation(token);
} catch (error) {
  log.error("invitation accept failed", { error, invitation_token: token });
  // adapter sends: { error_message, error_name, error_stack, error_cause, invitation_token }
}
```

Don't pre-stringify or pre-flatten errors at the call site — let the adapter do it. `JSON.stringify(error)` drops `message` and `stack`.

## PII and redaction

The PostHog adapter redacts before sending:

- **Attribute keys** matching `password`, `token`, `secret`, `authorization`, `cookie`, `auth`, `apikey`, `api_key`, `email`, visible Join Code fields, or token-family keys such as `access_token`, `refreshToken`, and `authToken` (case-insensitive) → replaced with `"[REDACTED]"`.
- **String values and error messages/stacks** containing `Bearer <…>`, JWT-shaped strings (`eyJ…`), or email-shaped strings → replaced inline.
- **String values** containing URL query params such as `token=...` or `code=...` → masked inline, including raw or encoded nested route intents.

This is best-effort, not airtight. Still:

- **Don't deliberately log secrets** assuming redaction will catch them. Redaction is a safety net for accidents (e.g. an `Error` from `fetch` that happened to carry an auth header).
- **Don't deliberately log emails or User profile traits.** Email-shaped strings are redacted in diagnostic messages and attributes, but redaction is still a safety net, not a logging policy.

## Where logs go

- **Local app development**: console (Metro / Expo logs) **and** PostHog when configured. The console output is your fast feedback loop; optional PostHog ingest exercises the production path.
- **Staging/production**: PostHog only. Records buffer up to 10s before flushing, on app foreground/background, on buffer fill, or via `posthog.flushLogs()`.
- **PostHog Logs UI**: project dashboard → Logs. Service name `dont-forget`; environment tagged from `APP_ENV`; version from `app.json`.

## Services and stores

Services and stores should accept a `Logger` dependency when they log diagnostics. The app composition layer can pass `useLogger()` or the app `logger`; tests and operator processes can pass their own logger without mocking `@/lib/logger`.

```ts
import { logger as defaultLogger, type Logger } from "@/lib/logger";

export type OpenHouseholdStoreConfig = {
  householdId: string;
  logger?: Logger;
};

export function openHouseholdStore(config: OpenHouseholdStoreConfig) {
  const log = (config.logger ?? defaultLogger).with({
    household_id: config.householdId,
  });
}
```

Bind domain context with `.with(...)` inside the service or store so every subsequent diagnostic log carries the same safe identifiers. Keep the default logger at the service/store boundary only; deeper helpers should receive the scoped logger when they need to log.

## What not to do

- **Don't call `posthog.logger.*` directly.** Go through `lib/logger.ts` so the swap-out path stays clean and redaction is enforced.
- **Don't import `logger` from `lib/posthog.ts`.** The PostHog client must finish constructing before the logger module loads. The boostrap warn in `posthog.ts` stays on `console.warn` for that reason.
- **Don't require service/store tests to mock `@/lib/logger` when a dependency can be injected.** Use `lib/test/mocks/logger.ts` for reusable logger fixtures.
- **Don't use the logger from `db/migrate.ts`** or other Node CLIs. Those are operator-facing tools; their stdout *is* the UX. They keep `console.*`.
- **Don't add new levels.** If you find yourself wanting `trace` or `fatal`, write `debug` or `error` instead. Adding levels touches the interface, the adapter, and every adapter you'd ever swap to.

## Adding a new feature? Suggested logging baseline

For a new screen / flow:

```ts
const log = useLogger().with({ feature: "list_share", list_id });

log.info("share sheet opened");
// ...user does the thing...
try {
  await sendInvitation(...);
  log.info("invitation sent", { invitee_email_domain: domainOf(email) });
} catch (error) {
  log.error("invitation send failed", { error });
}
```

Bind a `feature` (or screen) attribute at the top via `.with()`, log the entry/success/failure points, attach the relevant domain ids. That's enough to debug 90% of bugs without instrumenting every line.

## Swapping the provider

The whole point of the abstraction. Steps, when the day comes:

1. Implement a new class in `lib/logger.ts` matching the `LoggerAdapter` interface (one method: `log(level, message, attributes)`).
2. Keep the shared sensitive-key policy in `lib/sensitive-keys.ts`; move only provider-specific formatting or transport code into the new adapter.
3. Replace `new PostHogLoggerAdapter()` on the `logger` singleton.
4. Decide what to do about user identity binding — `useLogger()` already passes `user_id` via `.with()`, so most providers just need to read it from attributes.

No call sites move.

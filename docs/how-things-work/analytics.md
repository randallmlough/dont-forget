# Product analytics

Product-event tracking goes through `lib/analytics.ts`. Events use a typed catalog defined in `lib/analytics-events.ts`. Identity is auto-synced from Clerk; you do not call `identify` from auth screens.

For diagnostic logs (errors, debug info, anything exploratory), use the [logger](./logger.md), not analytics.

## Logs vs analytics — pick the right one

| Use `track(...)` when… | Use `logger.*(...)` when… |
|---|---|
| You're recording a curated, named product event | You're recording diagnostic info to debug a future problem |
| The shape is stable and lives in `EventMap` | The shape is exploratory or one-off |
| The event will appear in a funnel or dashboard | You're inside an error path |
| You're willing to update the type catalog | You don't want to think about a schema |

Rule of thumb: if you're tempted to invent a new event name on the fly without editing `analytics-events.ts`, that's a log.

## Quick reference

```ts
import { track, reset, screen } from "@/lib/analytics";

// product event — name and properties are type-checked against EventMap
track("user_signed_up", { method: "email" });
track("user_signed_in", { method: "apple" });

// screen view (already wired in app/_layout.tsx — usually you don't call this)
screen("/lists/abc123", { previous_screen: "/lists" });

// sign-out — clears PostHog identity. Pair with the user_signed_out event.
track("user_signed_out", {});
reset();
```

You will rarely call `identify` directly. See "Identity" below.

For services and stores, pass analytics as an explicit dependency when the module owns a product outcome. Service methods should track after the operation succeeds, not before persistence, network validation, or local side effects complete:

```ts
import { track } from "@/lib/analytics";

type ItemServiceAnalytics = {
  track: typeof track;
};

export type ItemServiceDeps = {
  analytics?: ItemServiceAnalytics;
};

export function createItemService(deps: ItemServiceDeps) {
  const analytics = deps.analytics ?? { track };

  return {
    async addItem(input: AddItemInput) {
      const item = await addItemLocally(input);
      // After adding item_added to EventMap.
      analytics.track("item_added", { household_id: input.householdId });
      return item;
    },
  };
}
```

Scope the dependency to the analytics operations the service/store actually needs. Most services that emit product events only need `track`; identity and sign-out flows may need `identify` or `reset`; screen tracking usually belongs in routing/screen composition. Most infrastructure stores should not emit analytics at all unless they own a user-visible product outcome.

## Adding a new event

1. **Open `lib/analytics-events.ts`** and add the event to `EventMap`:
   ```ts
   export type EventMap = {
     // ...existing events...
     list_created: { household_id: string; source: "manual" | "imported" };
   };
   ```
2. **Call `track(...)` from feature code.** TypeScript checks both the event name and the property shape — typos and missing properties fail to compile.
   ```ts
   track("list_created", { household_id: hid, source: "manual" });
   ```
3. **Decide if it warrants a dashboard.** If yes, add it after the event has been firing in production for a few days so PostHog has data to index.

### Naming

- Event names: `snake_case`, lowercase, past tense, subject-first. `list_created`, `invitation_sent`, `item_checked`. Not `createdList`, `listCreate`, `created_list`.
- Property keys: `snake_case`. `household_id`, `item_count`, `duration_ms`.
- Property values: prefer string literal unions (`"email" | "apple" | "google"`) over open strings — the type system stops `method: "appl"` typos that would silently dirty your dashboards.

### When to split vs combine events

- **Combine** when the events differ by a single attribute. `user_signed_in` with `method` is right; `user_signed_in_email` / `user_signed_in_apple` / `user_signed_in_google` is the antipattern this abstraction is built to prevent.
- **Split** when the events have meaningfully different schemas or trigger different downstream behavior. `list_created` and `list_deleted` are different events, not `list_action` with `action: "create" | "delete"`.

## Identity (you almost never call this directly)

`useAnalyticsIdentity()` runs in `app/_layout.tsx` (inside `<ClerkLoaded>`) and auto-syncs the canonical identity to PostHog whenever Clerk's user changes:

- `distinct_id` = Clerk `user.id` (stable, never changes for a person)
- `$set: { email, name, avatar_url }` — refreshed on every change
- `$set_once: { created_at }` — only set the first time the user is identified

You don't call `identify` from sign-in/sign-up code. After `setActive(...)`, Clerk's `useUser()` updates, the effect fires, identity flows to PostHog. Events fired before `setActive` (e.g. `track("user_signed_in", { method: "email" })`) attribute correctly because PostHog aliases the anonymous `distinct_id` to the new identified one when identify fires.

`identify(userId, traits)` is exported for the day you build a settings screen that lets users update analytics-only traits (preferred name, subscription tier, etc.). Until that day, leave it alone.

`reset()` is paired with sign-out. The Authenticated App Session provider action calls `track("user_signed_out", {})` *then* `reset()` *then* Authenticated App Session cleanup *then* Clerk `signOut()` — order matters. Reset before the event fires would tag the event against the next anonymous distinct_id; reset after Clerk fully signs out would race the next anonymous session.

## Where data ends up

- PostHog Persons UI keys on `distinct_id = clerk_user.id`. Search by email via the `email` person property.
- Events appear in the Activity feed within seconds; funnels and insights index over a few minutes.
- Service name `dont-forget`; environment tag comes from `APP_ENV` (`local`, `test`, `staging`, `production`). Filter dashboards by environment to keep non-production noise out.

## Redaction

Event properties pass through the same redactor as logs:

- Attribute keys matching `password`, `token`, `secret`, `authorization`, `cookie`, `auth`, `apikey`, `api_key` → `"[REDACTED]"`.
- String values containing `Bearer <…>` or JWT-shaped strings → masked.

The typed event catalog is your first line of defense — if you don't add a `password` property to `EventMap`, you can't fire one. Redaction is the safety net for `screen(...)` properties (route params can carry tokens) and future `identify(traits)` calls.

## What not to do

- **Don't call `posthog.capture/identify/reset/screen` directly.** Use the abstraction — that's why it exists.
- **Don't force service/store tests to mock `@/lib/analytics` when the module can accept an injected analytics dependency.** Use the existing module mock for UI/screen tests that import the global helpers directly.
- **Don't add events with loose `Record<string, unknown>` properties** to escape the type check. The whole point is the schema discipline. If you genuinely need a generic event, it's almost certainly a log instead.
- **Don't call `track` for things only you'll read once.** That's `logger.info`. Events are forever (or at least until you migrate dashboards); logs are throwaway.
- **Don't fire events from inside render functions.** Same as logs — use event handlers and effects.
- **Don't manually call `identify` in auth screens.** The auto-sync handles it.

## Swapping the provider

Same pattern as the logger ([ADR-0004](../adr/0004-pluggable-logger-abstraction.md), [ADR-0005](../adr/0005-pluggable-analytics-abstraction.md)):

1. Implement a new class matching the `AnalyticsAdapter` interface in `lib/analytics.ts` (four methods: `track`, `identify`, `reset`, `screen`).
2. Replace `new PostHogAnalyticsAdapter()` on the `adapter` const.
3. The `useAnalyticsIdentity()` hook keeps reading Clerk; the new adapter receives `userId` and traits identically. No call sites change.
4. Note that swapping analytics providers also means rebuilding dashboards and funnels in the new tool — the *code* swap is cheap, the *data* migration isn't.

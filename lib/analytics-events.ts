/**
 * Catalog of every product-analytics event the app emits.
 *
 * Adding an event: add a key here with its property type, then call
 * `track("event_name", { ... })` from feature code. TypeScript enforces that
 * the property shape at the call site matches the declared schema.
 *
 * Removing or renaming: do a two-phase rollout if the event is used in
 * dashboards — keep the old name firing until dashboards migrate, then drop.
 */
export type EventMap = {
  user_signed_in: { method: "email" | "apple" | "google" };
  user_signed_up: { method: "email" | "apple" | "google" };
  user_email_verified: Record<string, never>;
  user_signed_out: Record<string, never>;
};

export type EventName = keyof EventMap;

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
	household_session_loaded: {
		household_id: string;
		list_id: string;
		member_role: "owner" | "member";
		member_count: number;
		source: "online" | "cached";
	};
	household_session_cached: {
		household_id: string;
		list_id: string;
		member_role: "owner" | "member";
		member_count: number;
	};
	household_session_cache_invalidated: {
		household_id: string;
		fresh_household_id: string;
		reason: "unauthorized";
	};
	item_added: {
		household_id: string;
		list_id: string;
		item_id: string;
		user_id: string;
	};
	item_checked_state_changed: {
		household_id: string;
		item_id: string;
		user_id: string;
		checked: boolean;
	};
	user_signed_in: { method: "email" | "apple" | "google" };
	user_signed_up: { method: "email" | "apple" | "google" };
	user_email_verified: Record<string, never>;
	user_signed_out: Record<string, never>;
};

export type EventName = keyof EventMap;

import type { HouseholdJoinCodeSource } from "@/lib/household-join-code-source";

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
	authenticated_app_session_loaded: {
		household_id: string;
		member_role: "owner" | "member";
		member_count: number;
		source: "online" | "cached";
	};
	authenticated_app_session_cached: {
		household_id: string;
		member_role: "owner" | "member";
		member_count: number;
	};
	authenticated_app_session_cache_invalidated: {
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
		list_id: string;
		item_id: string;
		user_id: string;
		checked: boolean;
	};
	list_created: {
		household_id: string;
		list_id: string;
		user_id: string;
	};
	list_renamed: {
		household_id: string;
		list_id: string;
		user_id: string;
	};
	list_deleted: {
		household_id: string;
		list_id: string;
		user_id: string;
	};
	list_switched: {
		household_id: string;
		list_id: string;
		user_id: string;
	};
	invitation_accepted: {
		household_id: string;
		user_id: string;
		membership_created: boolean;
	};
	invitation_created: {
		household_id: string;
		creator_user_id: string;
		source: "email" | "link";
		reused_existing: boolean;
	};
	invitation_revoked: {
		household_id: string;
		revoked_by_user_id: string;
	};
	member_removed: {
		household_id: string;
		membership_id: string;
		requested_by_user_id: string;
	};
	member_role_changed: {
		household_id: string;
		membership_id: string;
		role: "owner" | "member";
		requested_by_user_id: string;
	};
	household_left: {
		household_id: string;
		user_id: string;
		promoted_membership_id: string | null;
	};
	household_renamed: {
		household_id: string;
		requested_by_user_id: string;
	};
	household_deleted: {
		household_id: string;
		deleted_by_user_id: string;
		member_count: number;
	};
	household_created: {
		household_id: string;
		created_by_user_id: string;
		source: "manual";
	};
	household_join_code_used: {
		household_id: string;
		user_id: string;
		membership_created: boolean;
		source: HouseholdJoinCodeSource;
	};
	household_join_code_regenerated: {
		household_id: string;
		requested_by_user_id: string;
	};
	household_join_code_disabled: {
		household_id: string;
		requested_by_user_id: string;
	};
	household_join_code_enabled: {
		household_id: string;
		requested_by_user_id: string;
	};
	household_switched: {
		household_id: string;
		user_id: string;
	};
	settings_opened: { source: "home" };
	appearance_preference_changed: {
		preference: "system" | "light" | "dark";
	};
	push_registration_changed: {
		enabled: boolean;
		outcome:
			| "registered"
			| "denied"
			| "unavailable"
			| "unregistered"
			| "failed";
	};
	onboarding_completed: {
		skipped: boolean;
		last_step: string;
	};
	user_name_updated: {
		user_id: string;
	};
	user_signed_in: { method: "email" | "apple" | "google" };
	user_signed_up: { method: "email" | "apple" | "google" };
	user_email_verified: Record<string, never>;
	user_signed_out: Record<string, never>;
};

export type EventName = keyof EventMap;

import type {
	NewHousehold,
	NewHouseholdJoinCode,
	NewHouseholdJoinCodeAttempt,
	NewHouseholdJoinCodeUse,
	NewInvitation,
	NewMembership,
	NewUser,
} from "@/db/schema/directory";
import type { NewItem, NewItemCheck, NewList } from "@/db/schema/household";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";

export const PRIMARY_HOUSEHOLD_SEED = {
	now: 1_700_000_000_000,
	household: {
		id: "hh_avery",
		name: "Avery",
		tursoDbName: "df-local-hh-seed-avery",
	},
	users: {
		avery: {
			id: "usr_avery",
			clerkUserId: "user_avery",
			email: "avery@example.com",
			firstName: "Avery",
			lastName: "Chen",
			displayName: "Avery Chen",
		},
		blake: {
			id: "usr_blake",
			clerkUserId: "user_blake",
			email: "blake@example.com",
			firstName: "Blake",
			lastName: "Rivera",
			displayName: "Blake Rivera",
		},
		cameron: {
			id: "usr_cameron",
			clerkUserId: "user_cameron",
			email: "cameron@example.com",
			firstName: "Cameron",
			lastName: "Patel",
			displayName: "Cameron Patel",
		},
	},
	memberships: {
		avery: { id: "mbr_avery" },
		blake: { id: "mbr_blake" },
		cameron: { id: "mbr_cameron" },
	},
	invitations: {
		pendingEmail: {
			id: "inv_avery_pending_email",
			token: "invitation-token-pending-email",
			email: "new-member@example.com",
		},
		pendingLink: {
			id: "inv_avery_pending_link",
			token: "invitation-token-pending-link",
		},
		accepted: {
			id: "inv_avery_accepted",
			token: "invitation-token-accepted",
			email: "blake@example.com",
		},
		revoked: {
			id: "inv_avery_revoked",
			token: "invitation-token-revoked",
			email: "revoked@example.com",
		},
		expired: {
			id: "inv_avery_expired",
			token: "invitation-token-expired",
			email: "expired@example.com",
		},
	},
	joinCodes: {
		active: { id: "hjc_avery_active", code: "ABCDEFGH" },
		replaced: { id: "hjc_avery_replaced", code: "HJKLMNPQ" },
		disabled: { id: "hjc_avery_disabled", code: "RSTUVWXY" },
	},
	joinCodeUses: {
		blake: { id: "hjcu_blake" },
		cameron: { id: "hjcu_cameron" },
	},
	lists: {
		groceries: { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME },
		hardware: { id: "lst_seed_hardware", name: "Hardware" },
		pharmacy: { id: "lst_seed_pharmacy", name: "Pharmacy" },
		archived: { id: "lst_seed_holiday", name: "Holiday Dinner" },
		deleted: { id: "lst_seed_camping", name: "Camping Trip" },
	},
	items: {
		unchecked: { id: "itm_seed_milk", name: "Milk" },
		checkedByAvery: { id: "itm_seed_eggs", name: "Eggs" },
		checkedByBlake: { id: "itm_seed_bread", name: "Bread" },
		tombstoned: { id: "itm_seed_coffee", name: "Coffee" },
	},
} as const;

export function userFixture(overrides: Partial<NewUser> = {}): NewUser {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		clerkUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.clerkUserId,
		email: PRIMARY_HOUSEHOLD_SEED.users.avery.email,
		firstName: PRIMARY_HOUSEHOLD_SEED.users.avery.firstName,
		lastName: PRIMARY_HOUSEHOLD_SEED.users.avery.lastName,
		displayName: PRIMARY_HOUSEHOLD_SEED.users.avery.displayName,
		activeHouseholdId: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

export function householdFixture(
	overrides: Partial<NewHousehold> = {},
): NewHousehold {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.household.id,
		name: PRIMARY_HOUSEHOLD_SEED.household.name,
		tursoDbName: PRIMARY_HOUSEHOLD_SEED.household.tursoDbName,
		createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		provisioningCompletedAt: now,
		createdAt: now,
		deletedAt: null,
		...overrides,
	};
}

export function membershipFixture(
	overrides: Partial<NewMembership> = {},
): NewMembership {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
		householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
		userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		role: "owner",
		joinedAt: now,
		removedAt: null,
		...overrides,
	};
}

export const memberFixture = membershipFixture;

export function invitationFixture(
	overrides: Partial<NewInvitation> = {},
): NewInvitation {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: "inv_avery_to_member",
		householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
		token: "invitation-token-avery",
		email: "new-member@example.com",
		createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		createdAt: now,
		expiresAt: now + 7 * 24 * 60 * 60 * 1000,
		acceptedAt: null,
		acceptedByUserId: null,
		revokedAt: null,
		...overrides,
	};
}

export function householdJoinCodeFixture(
	overrides: Partial<NewHouseholdJoinCode> = {},
): NewHouseholdJoinCode {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
		code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
		createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		createdAt: now,
		disabledAt: null,
		disabledByUserId: null,
		replacedAt: null,
		replacedByUserId: null,
		...overrides,
	};
}

export function householdJoinCodeUseFixture(
	overrides: Partial<NewHouseholdJoinCodeUse> = {},
): NewHouseholdJoinCodeUse {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.joinCodeUses.blake.id,
		householdJoinCodeId: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		householdId: PRIMARY_HOUSEHOLD_SEED.household.id,
		userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
		membershipId: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
		usedAt: now + 200,
		...overrides,
	};
}

export function householdJoinCodeAttemptFixture(
	overrides: Partial<NewHouseholdJoinCodeAttempt> = {},
): NewHouseholdJoinCodeAttempt {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		userId: PRIMARY_HOUSEHOLD_SEED.users.blake.id,
		failedCount: 1,
		windowStartedAt: now,
		lastFailedAt: now,
		...overrides,
	};
}

export function listFixture(overrides: Partial<NewList> = {}): NewList {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.lists.groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.groceries.name,
		createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		createdAt: now,
		updatedAt: now,
		archivedAt: null,
		deletedAt: null,
		...overrides,
	};
}

export function itemFixture(overrides: Partial<NewItem> = {}): NewItem {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		id: PRIMARY_HOUSEHOLD_SEED.items.unchecked.id,
		listId: PRIMARY_HOUSEHOLD_SEED.lists.groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.unchecked.name,
		notes: null,
		position: 0,
		createdByUserId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		...overrides,
	};
}

export function itemCheckFixture(
	overrides: Partial<NewItemCheck> = {},
): NewItemCheck {
	const now = PRIMARY_HOUSEHOLD_SEED.now;
	return {
		itemId: PRIMARY_HOUSEHOLD_SEED.items.checkedByAvery.id,
		userId: PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		checkedAt: now + 100,
		updatedAt: now + 100,
		...overrides,
	};
}

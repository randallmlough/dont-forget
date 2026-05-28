import type { Item } from "@/lib/services/item";
import type { List } from "@/lib/services/list";
import type { SessionBootstrap } from "@/lib/services/session/bootstrap";
import type { CachedSessionBootstrap } from "@/lib/services/session/cache";

export type SessionBootstrapFixtureOverrides = {
	householdId?: string;
	householdName?: string;
	householdDatabaseAuthToken?: string;
	householdDatabaseExpiresAt?: number;
	householdDatabaseUrl?: string;
};

export type CachedSessionBootstrapFixtureOverrides =
	SessionBootstrapFixtureOverrides & {
		initializedAt?: number;
	};

export function sessionBootstrapFixture(
	overrides: SessionBootstrapFixtureOverrides = {},
): SessionBootstrap {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: {
			id: overrides.householdId ?? "hh_avery",
			name: overrides.householdName ?? "Avery",
		},
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		householdDatabase: {
			url: overrides.householdDatabaseUrl ?? "libsql://example.turso.io",
			authToken:
				overrides.householdDatabaseAuthToken ?? "secret-household-token",
			expiresAt: overrides.householdDatabaseExpiresAt ?? 1_700_000_000_000,
		},
	};
}

export function cachedSessionBootstrapFixture(
	overrides: CachedSessionBootstrapFixtureOverrides = {},
): CachedSessionBootstrap {
	const { householdDatabase: _householdDatabase, ...sessionMetadata } =
		sessionBootstrapFixture(overrides);

	return {
		...sessionMetadata,
		householdDatabase: {
			url: overrides.householdDatabaseUrl ?? "libsql://example.turso.io",
			expiresAt: overrides.householdDatabaseExpiresAt ?? 1_700_000_000_000,
		},
		initializedAt: overrides.initializedAt ?? 1_700_000_000_000,
	};
}

export function listFixture(overrides: Partial<List> = {}): List {
	return {
		id: "lst_default_groceries",
		householdId: "hh_avery",
		name: "Groceries",
		createdByUserId: "usr_avery",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

export function itemFixture(overrides: Partial<Item> = {}): Item {
	return {
		id: "itm_milk",
		householdId: "hh_avery",
		listId: "lst_default_groceries",
		name: "Milk",
		checked: false,
		checkedByUserId: null,
		position: 0,
		createdByUserId: "usr_avery",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		...overrides,
	};
}

import type { SessionBootstrap } from "./bootstrap";
import type { CachedSessionBootstrap } from "./cache";

export type SessionBootstrapFixtureOverrides = {
	householdId?: string;
	householdName?: string;
	households?: SessionBootstrap["households"];
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
			onboardingCompletedAt: null,
		},
		activeHousehold: {
			id: overrides.householdId ?? "hh_avery",
			name: overrides.householdName ?? "Avery",
		},
		households: overrides.households ?? [
			{
				id: overrides.householdId ?? "hh_avery",
				name: overrides.householdName ?? "Avery",
				role: "owner",
				isActive: true,
			},
		],
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
		user: {
			...sessionMetadata.user,
			onboardingCompletedAt: sessionMetadata.user.onboardingCompletedAt ?? 0,
		},
		householdDatabase: {
			url: overrides.householdDatabaseUrl ?? "libsql://example.turso.io",
			expiresAt: overrides.householdDatabaseExpiresAt ?? 1_700_000_000_000,
		},
		initializedAt: overrides.initializedAt ?? 1_700_000_000_000,
	};
}

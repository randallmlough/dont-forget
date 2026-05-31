import { and, asc, eq, isNull } from "drizzle-orm";

import type { DirectoryDb } from "@/db/client";
import { households, memberships, users } from "@/db/schema/directory";
import { serverServiceAnalytics } from "@/lib/server/analytics";
import type { ServiceAnalytics } from "@/lib/services/analytics";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type ActiveHouseholdServiceDirectory =
	| DirectoryDb
	| DirectoryTransaction;

export class ActiveHouseholdMembershipRequiredError extends Error {
	constructor() {
		super("User must be an active Member of the Household");
		this.name = "ActiveHouseholdMembershipRequiredError";
	}
}

export type ActiveHouseholdSelection = {
	membershipId: string;
	membershipRole: "owner" | "member";
	householdId: string;
	householdName: string;
	householdTursoDbName: string;
	householdProvisioningCompletedAt: number | null;
};

export type AssociatedHousehold = {
	householdId: string;
	householdName: string;
	membershipRole: "owner" | "member";
	isActive: boolean;
};

export type SwitchActiveHouseholdInput = {
	userId: string;
	householdId: string;
};

export type ActiveHouseholdService = {
	getActiveHousehold(userId: string): Promise<ActiveHouseholdSelection | null>;
	listAssociatedHouseholds(userId: string): Promise<AssociatedHousehold[]>;
	setActiveHousehold(
		input: SwitchActiveHouseholdInput,
	): Promise<ActiveHouseholdSelection>;
	switchActiveHousehold(
		input: SwitchActiveHouseholdInput,
	): Promise<ActiveHouseholdSelection>;
};

export type ActiveHouseholdServiceDeps = {
	directory: ActiveHouseholdServiceDirectory;
	analytics?: ServiceAnalytics;
};

export function createActiveHouseholdService(
	deps: ActiveHouseholdServiceDeps,
): ActiveHouseholdService {
	const analytics = deps.analytics ?? serverServiceAnalytics;
	return {
		getActiveHousehold(userId) {
			return getActiveHousehold(userId, deps.directory);
		},
		listAssociatedHouseholds(userId) {
			return listAssociatedHouseholds(userId, deps.directory);
		},
		setActiveHousehold(input) {
			return setActiveHousehold(input, deps.directory);
		},
		switchActiveHousehold(input) {
			return switchActiveHousehold(input, deps.directory, analytics);
		},
	};
}

async function getActiveHousehold(
	userId: string,
	directory: ActiveHouseholdServiceDirectory,
): Promise<ActiveHouseholdSelection | null> {
	const [user] = await directory
		.select({ activeHouseholdId: users.activeHouseholdId })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user) return null;

	if (user.activeHouseholdId) {
		const current = await findActiveMembershipSelection(
			{ userId, householdId: user.activeHouseholdId },
			directory,
		);
		if (current) return current;
	}

	const fallback = await findOldestActiveMembershipSelection(userId, directory);
	await directory
		.update(users)
		.set({
			activeHouseholdId: fallback?.householdId ?? null,
			updatedAt: Date.now(),
		})
		.where(eq(users.id, userId));

	return fallback;
}

async function listAssociatedHouseholds(
	userId: string,
	directory: ActiveHouseholdServiceDirectory,
): Promise<AssociatedHousehold[]> {
	const active = await getActiveHousehold(userId, directory);
	const rows = await directory
		.select({
			householdId: households.id,
			householdName: households.name,
			membershipRole: memberships.role,
			joinedAt: memberships.joinedAt,
		})
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.userId, userId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.orderBy(asc(memberships.joinedAt), asc(memberships.id));

	return rows.map((row) => ({
		householdId: row.householdId,
		householdName: row.householdName,
		membershipRole: row.membershipRole,
		isActive: row.householdId === active?.householdId,
	}));
}

async function switchActiveHousehold(
	input: SwitchActiveHouseholdInput,
	directory: ActiveHouseholdServiceDirectory,
	analytics: ServiceAnalytics,
): Promise<ActiveHouseholdSelection> {
	const selection = await setActiveHousehold(input, directory);

	analytics.track("household_switched", {
		household_id: selection.householdId,
		user_id: input.userId,
	});

	return selection;
}

async function setActiveHousehold(
	input: SwitchActiveHouseholdInput,
	directory: ActiveHouseholdServiceDirectory,
): Promise<ActiveHouseholdSelection> {
	const selection = await findActiveMembershipSelection(input, directory);
	if (!selection) throw new ActiveHouseholdMembershipRequiredError();

	await directory
		.update(users)
		.set({ activeHouseholdId: selection.householdId, updatedAt: Date.now() })
		.where(eq(users.id, input.userId));

	return selection;
}

async function findOldestActiveMembershipSelection(
	userId: string,
	directory: ActiveHouseholdServiceDirectory,
): Promise<ActiveHouseholdSelection | null> {
	const [row] = await directory
		.select(activeHouseholdSelectionColumns)
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.userId, userId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.orderBy(asc(memberships.joinedAt), asc(memberships.id))
		.limit(1);

	return row ?? null;
}

async function findActiveMembershipSelection(
	input: { userId: string; householdId: string },
	directory: ActiveHouseholdServiceDirectory,
): Promise<ActiveHouseholdSelection | null> {
	const [row] = await directory
		.select(activeHouseholdSelectionColumns)
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.userId, input.userId),
				eq(memberships.householdId, input.householdId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return row ?? null;
}

const activeHouseholdSelectionColumns = {
	membershipId: memberships.id,
	membershipRole: memberships.role,
	householdId: households.id,
	householdName: households.name,
	householdTursoDbName: households.tursoDbName,
	householdProvisioningCompletedAt: households.provisioningCompletedAt,
};

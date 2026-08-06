import { serverServiceAnalytics } from "@api/analytics";
import {
	type DirectoryTransaction,
	runDirectoryTransaction,
} from "@api/directory-transaction";
import type { ActiveMembership } from "@api/households/member-service";
import type { DirectoryDb } from "@dont-forget/db";
import {
	type Household,
	households,
	type Membership,
	memberships,
	type User,
} from "@dont-forget/db/schema";
import type { ServiceAnalytics } from "@dont-forget/shared";
import { createAppId } from "@dont-forget/shared";
import { and, eq, isNull } from "drizzle-orm";
import {
	createInitialHouseholdJoinCode,
	type HouseholdJoinCodeGenerator,
} from "./join-code-service";

export type HouseholdServiceDirectory = DirectoryDb | DirectoryTransaction;

export type HouseholdService = {
	createOwnedHousehold(input: { user: User; name: string }): Promise<Household>;
	renameHousehold(input: {
		householdId: string;
		name: string;
		requestedByUserId: string;
	}): Promise<Household>;
	activeMembershipFrom(
		household: Household,
		membership: Membership,
	): ActiveMembership;
};

export type HouseholdServiceDeps = {
	directory: HouseholdServiceDirectory;
	generateJoinCode?: HouseholdJoinCodeGenerator;
	analytics?: ServiceAnalytics;
};

export class HouseholdForbiddenError extends Error {
	constructor() {
		super("Forbidden");
		this.name = "HouseholdForbiddenError";
	}
}

export class HouseholdNameInvalidError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HouseholdNameInvalidError";
	}
}

export class HouseholdNotFoundError extends Error {
	constructor() {
		super("Household not found.");
		this.name = "HouseholdNotFoundError";
	}
}

export function createHouseholdService(
	deps: HouseholdServiceDeps,
): HouseholdService {
	const analytics = deps.analytics ?? serverServiceAnalytics;

	return {
		createOwnedHousehold(input) {
			return createOwnedHousehold(input, deps.directory, deps.generateJoinCode);
		},
		renameHousehold(input) {
			return renameHousehold(input, deps.directory, analytics);
		},
		activeMembershipFrom,
	};
}

async function createOwnedHousehold(
	input: { user: User; name: string },
	directory: HouseholdServiceDirectory,
	generateJoinCode: HouseholdJoinCodeGenerator | undefined,
): Promise<Household> {
	const now = Date.now();
	const householdId = createAppId("hh");
	const household: Household = {
		id: householdId,
		name: input.name,
		createdByUserId: input.user.id,
		createdAt: now,
		deletedAt: null,
	};

	await directory.insert(households).values(household);
	await createInitialHouseholdJoinCode(
		{
			householdId,
			createdByUserId: input.user.id,
			now,
		},
		directory,
		generateJoinCode,
	);
	return household;
}

async function renameHousehold(
	input: { householdId: string; name: string; requestedByUserId: string },
	directory: HouseholdServiceDirectory,
	analytics: ServiceAnalytics,
): Promise<Household> {
	const name = normalizeHouseholdName(input.name);
	const household = await runDirectoryTransaction(directory, async (tx) => {
		const requester = await findActiveOwnerMembership(
			{
				householdId: input.householdId,
				userId: input.requestedByUserId,
			},
			tx,
		);
		if (!requester) throw new HouseholdForbiddenError();

		const [updated] = await tx
			.update(households)
			.set({ name })
			.where(
				and(eq(households.id, input.householdId), isNull(households.deletedAt)),
			)
			.returning();
		if (!updated) throw new HouseholdNotFoundError();

		return updated;
	});

	analytics.track("household_renamed", {
		household_id: household.id,
		requested_by_user_id: input.requestedByUserId,
	});

	return household;
}

export function normalizeHouseholdName(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) {
		throw new HouseholdNameInvalidError("Household name is required.");
	}
	if (trimmed.length > 80) {
		throw new HouseholdNameInvalidError(
			"Household name must be 80 characters or fewer.",
		);
	}
	return trimmed;
}

async function findActiveOwnerMembership(
	input: { householdId: string; userId: string },
	directory: HouseholdServiceDirectory,
): Promise<Membership | null> {
	const [row] = await directory
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.userId, input.userId),
				eq(memberships.role, "owner"),
				isNull(memberships.removedAt),
			),
		)
		.limit(1);

	return row ?? null;
}

function activeMembershipFrom(
	household: Household,
	membership: Membership,
): ActiveMembership {
	return {
		membershipId: membership.id,
		membershipRole: membership.role,
		householdId: household.id,
		householdName: household.name,
	};
}

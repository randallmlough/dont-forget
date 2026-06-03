import { and, asc, eq, isNull } from "drizzle-orm";

import type { DirectoryDb } from "@/db/client";
import {
	type Household,
	households,
	type Membership,
	type User,
} from "@/db/schema/directory";
import type { AppEnv } from "@/lib/env";
import { createAppId } from "@/lib/ids";
import type { ActiveMembership } from "@/lib/services/member/server";
import {
	createInitialHouseholdJoinCode,
	type HouseholdJoinCodeGenerator,
} from "./household-join-code-service";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type HouseholdServiceDirectory = DirectoryDb | DirectoryTransaction;

export type HouseholdService = {
	findPendingCreatedHousehold(userId: string): Promise<Household | null>;
	createOwnedHousehold(input: {
		appEnv: AppEnv;
		user: User;
		name: string;
	}): Promise<Household>;
	markProvisioningCompleted(householdId: string): Promise<void>;
	activeMembershipFrom(
		household: Household,
		membership: Membership,
	): ActiveMembership;
};

export type HouseholdServiceDeps = {
	directory: HouseholdServiceDirectory;
	generateJoinCode?: HouseholdJoinCodeGenerator;
};

export function createHouseholdService(
	deps: HouseholdServiceDeps,
): HouseholdService {
	return {
		findPendingCreatedHousehold(userId) {
			return findPendingCreatedHousehold(userId, deps.directory);
		},
		createOwnedHousehold(input) {
			return createOwnedHousehold(input, deps.directory, deps.generateJoinCode);
		},
		async markProvisioningCompleted(householdId) {
			await deps.directory
				.update(households)
				.set({ provisioningCompletedAt: Date.now() })
				.where(eq(households.id, householdId));
		},
		activeMembershipFrom,
	};
}

export function householdDatabaseName(
	appEnv: AppEnv,
	householdId: string,
): string {
	const suffix = householdId
		.replace(/^hh_/, "")
		.replace(/[^a-z0-9]/gi, "")
		.toLowerCase();
	if (!suffix) {
		throw new Error("Household ID must include a database-safe suffix");
	}

	return `df-${appEnv}-hh-${suffix.slice(0, 32)}`;
}

async function findPendingCreatedHousehold(
	userId: string,
	directory: HouseholdServiceDirectory,
): Promise<Household | null> {
	const [row] = await directory
		.select()
		.from(households)
		.where(
			and(
				eq(households.createdByUserId, userId),
				isNull(households.provisioningCompletedAt),
				isNull(households.deletedAt),
			),
		)
		.orderBy(asc(households.createdAt), asc(households.id))
		.limit(1);

	return row ?? null;
}

async function createOwnedHousehold(
	input: { appEnv: AppEnv; user: User; name: string },
	directory: HouseholdServiceDirectory,
	generateJoinCode: HouseholdJoinCodeGenerator | undefined,
): Promise<Household> {
	const now = Date.now();
	const householdId = createAppId("hh");
	const household: Household = {
		id: householdId,
		name: input.name,
		tursoDbName: householdDatabaseName(input.appEnv, householdId),
		createdByUserId: input.user.id,
		provisioningCompletedAt: null,
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

function activeMembershipFrom(
	household: Household,
	membership: Membership,
): ActiveMembership {
	return {
		membershipId: membership.id,
		membershipRole: membership.role,
		householdId: household.id,
		householdName: household.name,
		householdTursoDbName: household.tursoDbName,
		householdProvisioningCompletedAt: household.provisioningCompletedAt,
	};
}

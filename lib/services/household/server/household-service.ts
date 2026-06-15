import { and, asc, eq, isNull } from "drizzle-orm";
import {
	type Household,
	households,
	type Membership,
	memberships,
	type User,
} from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
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

export type DeleteHouseholdResult = { tursoDbName: string };

export type HouseholdService = {
	findPendingCreatedHousehold(userId: string): Promise<Household | null>;
	createOwnedHousehold(input: {
		appEnv: AppEnv;
		user: User;
		name: string;
	}): Promise<Household>;
	renameHousehold(input: {
		householdId: string;
		name: string;
		requestedByUserId: string;
	}): Promise<Household>;
	deleteHousehold(input: {
		householdId: string;
		requestedByUserId: string;
	}): Promise<DeleteHouseholdResult>;
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
	return {
		findPendingCreatedHousehold(userId) {
			return findPendingCreatedHousehold(userId, deps.directory);
		},
		createOwnedHousehold(input) {
			return createOwnedHousehold(input, deps.directory, deps.generateJoinCode);
		},
		renameHousehold(input) {
			return renameHousehold(input, deps.directory);
		},
		deleteHousehold(input) {
			return deleteHousehold(input, deps.directory);
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
		databaseDeletedAt: null,
		databaseDeletionFailedAt: null,
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
): Promise<Household> {
	const name = normalizeHouseholdName(input.name);
	const household = await findActiveHousehold(input.householdId, directory);
	if (!household) throw new HouseholdNotFoundError();

	const requester = await findActiveOwnerMembership(
		{
			householdId: input.householdId,
			userId: input.requestedByUserId,
		},
		directory,
	);
	if (!requester) throw new HouseholdForbiddenError();

	await directory
		.update(households)
		.set({ name })
		.where(
			and(eq(households.id, input.householdId), isNull(households.deletedAt)),
		);

	return { ...household, name };
}

async function deleteHousehold(
	input: { householdId: string; requestedByUserId: string },
	directory: HouseholdServiceDirectory,
): Promise<DeleteHouseholdResult> {
	const household = await findActiveHousehold(input.householdId, directory);
	if (!household) throw new HouseholdNotFoundError();

	const requester = await findActiveOwnerMembership(
		{
			householdId: input.householdId,
			userId: input.requestedByUserId,
		},
		directory,
	);
	if (!requester) throw new HouseholdForbiddenError();

	const now = Date.now();
	await directory
		.update(households)
		.set({ deletedAt: now })
		.where(
			and(eq(households.id, input.householdId), isNull(households.deletedAt)),
		);
	await directory
		.update(memberships)
		.set({ removedAt: now })
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				isNull(memberships.removedAt),
			),
		);

	return { tursoDbName: household.tursoDbName };
}

function normalizeHouseholdName(name: string): string {
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

async function findActiveHousehold(
	householdId: string,
	directory: HouseholdServiceDirectory,
): Promise<Household | null> {
	const [household] = await directory
		.select()
		.from(households)
		.where(and(eq(households.id, householdId), isNull(households.deletedAt)))
		.limit(1);

	return household ?? null;
}

async function findActiveOwnerMembership(
	input: { householdId: string; userId: string },
	directory: HouseholdServiceDirectory,
): Promise<Membership | null> {
	const [row] = await directory
		.select()
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.userId, input.userId),
				eq(memberships.role, "owner"),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return row?.memberships ?? null;
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

import { and, asc, eq, isNull, ne } from "drizzle-orm";

import {
	households,
	invitations,
	memberships,
	type User,
} from "@/db/schema/directory";
import type { DirectoryDb } from "@/db/server/client";
import {
	createTursoPlatformClient,
	type TursoPlatformClient,
} from "@/db/server/turso-platform";
import { runWithSqliteBusyRetry } from "@/db/utils";
import { asError } from "@/lib/errors";
import { redactAttributes } from "@/lib/redact";
import {
	createHouseholdService,
	type HouseholdService,
} from "@/lib/services/household/server";
import type { HouseholdServiceDirectory } from "@/lib/services/household/server/household-service";
import {
	createMemberService,
	type MemberService,
	type MemberServiceDirectory,
} from "@/lib/services/member/server";
import { createPushTokenService } from "@/lib/services/push/server";
import {
	lockHouseholdLifecycle,
	lockUserLifecycle,
} from "@/lib/services/shared/server/lifecycle-lock";
import { createUserService, type UserService } from "./user-service";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type UserDeletionService = {
	deleteUser(input: {
		user: User;
		clerkUserId: string;
	}): Promise<UserDeletionSummary>;
};

export type UserDeletionSummary = {
	leftHouseholdIds: string[];
	deletedHouseholdIds: string[];
	databasesNotDeleted: string[];
};

export type UserDeletionServiceDeps = {
	directory: DirectoryDb;
	memberService?: (directory: MemberServiceDirectory) => MemberService;
	householdService?: (directory: HouseholdServiceDirectory) => HouseholdService;
	tursoPlatform?: () => TursoPlatformClient;
	deleteClerkUser: (clerkUserId: string) => Promise<void>;
	anonymizeUser?: (input: {
		userId: string;
		clerkUserId: string;
	}) => Promise<void>;
	transactionRunner?: <T>(operation: () => Promise<T>) => Promise<T>;
	userService?: (directory: DirectoryTransaction) => UserService;
};

type DirectoryDeletionResult = {
	leftHouseholdIds: string[];
	deletedHouseholdIds: string[];
	tursoDbNames: string[];
};

type ActiveUserMembership = {
	householdId: string;
	role: "owner" | "member";
};

export function createUserDeletionService(
	deps: UserDeletionServiceDeps,
): UserDeletionService {
	return {
		async deleteUser(input) {
			const runTransaction = deps.transactionRunner ?? runWithSqliteBusyRetry;
			const directoryResult = await runTransaction(() =>
				deps.directory.transaction((tx) =>
					deleteDirectoryUserData(input, tx, deps),
				),
			);
			const databasesNotDeleted = await deleteHouseholdDatabases(
				directoryResult.tursoDbNames,
				deps,
			);
			await deps.deleteClerkUser(input.clerkUserId);
			await createUserService({ directory: deps.directory }).recordClerkDeleted(
				{
					userId: input.user.id,
					clerkUserId: input.clerkUserId,
				},
			);
			await (
				deps.anonymizeUser ??
				((identity) =>
					createUserService({ directory: deps.directory }).anonymizeUser(
						identity,
					))
			)({ userId: input.user.id, clerkUserId: input.clerkUserId });
			return {
				leftHouseholdIds: directoryResult.leftHouseholdIds,
				deletedHouseholdIds: directoryResult.deletedHouseholdIds,
				databasesNotDeleted,
			};
		},
	};
}

async function deleteDirectoryUserData(
	input: { user: User; clerkUserId: string },
	tx: DirectoryTransaction,
	deps: UserDeletionServiceDeps,
): Promise<DirectoryDeletionResult> {
	const { user } = input;
	await lockUserLifecycle(user.id, tx);
	const activeMemberships = await listActiveUserMemberships(user.id, tx);
	const leftHouseholdIds: string[] = [];
	const deletedHouseholdIds: string[] = [];
	const tursoDbNames: string[] = [];

	for (const membership of activeMemberships) {
		await lockHouseholdLifecycle(membership.householdId, tx);
		const otherMemberCount = await countOtherActiveMembers(
			{
				householdId: membership.householdId,
				userId: user.id,
			},
			tx,
		);

		if (otherMemberCount === 0) {
			if (membership.role !== "owner") {
				await tx
					.update(memberships)
					.set({ role: "owner" })
					.where(
						and(
							eq(memberships.householdId, membership.householdId),
							eq(memberships.userId, user.id),
							isNull(memberships.removedAt),
						),
					);
			}
			const { tursoDbName } = await householdService(tx, deps).deleteHousehold({
				householdId: membership.householdId,
				requestedByUserId: user.id,
			});
			deletedHouseholdIds.push(membership.householdId);
			tursoDbNames.push(tursoDbName);
			continue;
		}

		await memberService(tx, deps).leaveHousehold({
			householdId: membership.householdId,
			userId: user.id,
		});
		leftHouseholdIds.push(membership.householdId);
	}

	await createPushTokenService({ directory: tx }).deleteTokensForUser(user.id);
	await userService(tx, deps).markUserDeleted({
		userId: user.id,
		clerkUserId: input.clerkUserId,
	});

	await tx
		.update(invitations)
		.set({ revokedAt: Date.now() })
		.where(
			and(
				eq(invitations.createdByUserId, user.id),
				isNull(invitations.acceptedAt),
				isNull(invitations.revokedAt),
			),
		);

	return { leftHouseholdIds, deletedHouseholdIds, tursoDbNames };
}

function userService(
	directory: DirectoryTransaction,
	deps: UserDeletionServiceDeps,
): UserService {
	return deps.userService?.(directory) ?? createUserService({ directory });
}

async function listActiveUserMemberships(
	userId: string,
	directory: DirectoryTransaction,
): Promise<ActiveUserMembership[]> {
	return directory
		.select({
			householdId: memberships.householdId,
			role: memberships.role,
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
		.orderBy(asc(memberships.joinedAt), asc(memberships.id))
		.then((rows) =>
			rows.map(({ joinedAt: _joinedAt, ...membership }) => membership),
		);
}

async function countOtherActiveMembers(
	input: { householdId: string; userId: string },
	directory: DirectoryTransaction,
): Promise<number> {
	const rows = await directory
		.select({ id: memberships.id })
		.from(memberships)
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				ne(memberships.userId, input.userId),
				isNull(memberships.removedAt),
			),
		);
	return rows.length;
}

async function deleteHouseholdDatabases(
	tursoDbNames: string[],
	deps: UserDeletionServiceDeps,
): Promise<string[]> {
	if (tursoDbNames.length === 0) return [];

	const databasesNotDeleted: string[] = [];
	const turso = deps.tursoPlatform?.() ?? createTursoPlatformClient();
	for (const tursoDbName of tursoDbNames) {
		try {
			await turso.deleteDatabase(tursoDbName);
		} catch (error) {
			databasesNotDeleted.push(tursoDbName);
			console.error(
				"Delete account Household database teardown failed",
				redactAttributes({ error: asError(error), turso_db_name: tursoDbName }),
			);
		}
	}
	return databasesNotDeleted;
}

function memberService(
	directory: MemberServiceDirectory,
	deps: UserDeletionServiceDeps,
): MemberService {
	return deps.memberService?.(directory) ?? createMemberService({ directory });
}

function householdService(
	directory: HouseholdServiceDirectory,
	deps: UserDeletionServiceDeps,
): HouseholdService {
	return (
		deps.householdService?.(directory) ?? createHouseholdService({ directory })
	);
}

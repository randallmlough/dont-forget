import { and, asc, eq, isNull } from "drizzle-orm";

import type { DirectoryDb } from "@/db/client";
import {
	households,
	type Membership,
	memberships,
	type User,
	users,
} from "@/db/schema/directory";
import { createAppId } from "@/lib/ids";

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

export type MemberServiceDirectory = DirectoryDb | DirectoryTransaction;

export type ActiveMembership = {
	membershipId: string;
	membershipRole: "owner" | "member";
	householdId: string;
	householdName: string;
	householdTursoDbName: string;
	householdProvisioningCompletedAt: number | null;
};

export type HouseholdMember = {
	membershipId: string;
	userId: string;
	role: "owner" | "member";
	displayName: string | null;
};

export type ActiveHouseholdMembership = {
	membershipId: string;
	userId: string;
	role: "owner" | "member";
	householdId: string;
	householdName: string;
};

export type EnsurePlainMemberMembershipResult = {
	membership: Membership;
	created: boolean;
};

export type MemberService = {
	findOldestActiveMembership(userId: string): Promise<ActiveMembership | null>;
	findActiveHouseholdMembership(input: {
		householdId: string;
		userId: string;
	}): Promise<ActiveHouseholdMembership | null>;
	ensureOwnerMembership(input: {
		householdId: string;
		user: User;
	}): Promise<Membership>;
	ensurePlainMemberMembership(input: {
		householdId: string;
		userId: string;
		joinedAt?: number;
	}): Promise<EnsurePlainMemberMembershipResult>;
	listHouseholdMembers(householdId: string): Promise<HouseholdMember[]>;
};

export type MemberServiceDeps = {
	directory: MemberServiceDirectory;
};

export function createMemberService(deps: MemberServiceDeps): MemberService {
	return {
		findOldestActiveMembership(userId) {
			return findOldestActiveMembership(userId, deps.directory);
		},
		findActiveHouseholdMembership(input) {
			return findActiveHouseholdMembership(input, deps.directory);
		},
		ensureOwnerMembership(input) {
			return ensureOwnerMembership(input, deps.directory);
		},
		ensurePlainMemberMembership(input) {
			return ensurePlainMemberMembership(input, deps.directory);
		},
		listHouseholdMembers(householdId) {
			return listHouseholdMembers(householdId, deps.directory);
		},
	};
}

async function findOldestActiveMembership(
	userId: string,
	directory: MemberServiceDirectory,
): Promise<ActiveMembership | null> {
	const [row] = await directory
		.select({
			membershipId: memberships.id,
			membershipRole: memberships.role,
			householdId: households.id,
			householdName: households.name,
			householdTursoDbName: households.tursoDbName,
			householdProvisioningCompletedAt: households.provisioningCompletedAt,
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
		.limit(1);

	return row ?? null;
}

async function findActiveHouseholdMembership(
	input: { householdId: string; userId: string },
	directory: MemberServiceDirectory,
): Promise<ActiveHouseholdMembership | null> {
	const [row] = await directory
		.select({
			membershipId: memberships.id,
			userId: memberships.userId,
			role: memberships.role,
			householdId: households.id,
			householdName: households.name,
		})
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.userId, input.userId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return row ?? null;
}

async function ensureOwnerMembership(
	input: { householdId: string; user: User },
	directory: MemberServiceDirectory,
): Promise<Membership> {
	const [existing] = await directory
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.userId, input.user.id),
				isNull(memberships.removedAt),
			),
		)
		.limit(1);

	if (existing) return existing;

	const membership: Membership = {
		id: createAppId("mbr"),
		householdId: input.householdId,
		userId: input.user.id,
		role: "owner",
		joinedAt: Date.now(),
		removedAt: null,
	};
	await directory.insert(memberships).values(membership);
	return membership;
}

async function ensurePlainMemberMembership(
	input: { householdId: string; userId: string; joinedAt?: number },
	directory: MemberServiceDirectory,
): Promise<EnsurePlainMemberMembershipResult> {
	const existing = await findActiveMembershipRow(input, directory);
	if (existing) return { membership: existing, created: false };

	const membership: Membership = {
		id: createAppId("mbr"),
		householdId: input.householdId,
		userId: input.userId,
		role: "member",
		joinedAt: input.joinedAt ?? Date.now(),
		removedAt: null,
	};

	try {
		await directory.insert(memberships).values(membership);
		return { membership, created: true };
	} catch (error) {
		const createdByConcurrentRequest = await findActiveMembershipRow(
			input,
			directory,
		);
		if (createdByConcurrentRequest) {
			return { membership: createdByConcurrentRequest, created: false };
		}
		throw error;
	}
}

async function findActiveMembershipRow(
	input: { householdId: string; userId: string },
	directory: MemberServiceDirectory,
): Promise<Membership | null> {
	const [existing] = await directory
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.userId, input.userId),
				isNull(memberships.removedAt),
			),
		)
		.limit(1);

	return existing ?? null;
}

async function listHouseholdMembers(
	householdId: string,
	directory: MemberServiceDirectory,
): Promise<HouseholdMember[]> {
	const rows = await directory
		.select({
			membershipId: memberships.id,
			userId: users.id,
			role: memberships.role,
			displayName: users.displayName,
			joinedAt: memberships.joinedAt,
		})
		.from(memberships)
		.innerJoin(users, eq(users.id, memberships.userId))
		.where(
			and(
				eq(memberships.householdId, householdId),
				isNull(memberships.removedAt),
			),
		)
		.orderBy(asc(memberships.joinedAt), asc(memberships.id));

	return rows.map(({ joinedAt: _joinedAt, ...row }) => row);
}

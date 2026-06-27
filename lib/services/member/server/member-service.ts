import { and, asc, eq, isNull } from "drizzle-orm";
import {
	households,
	type Membership,
	memberships,
	type User,
	users,
} from "@/db/schema/postgres";
import type { DirectoryDb } from "@/db/server/client";
import { createAppId } from "@/lib/ids";
import { serverServiceAnalytics } from "@/lib/server/analytics";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import {
	type DirectoryTransaction,
	lockHouseholdRow,
	runDirectoryTransaction,
} from "@/lib/services/shared/server/directory-transaction";

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

export type EnsurePlainMemberMembershipResult = {
	membership: Membership;
	created: boolean;
};

export class MemberManagementForbiddenError extends Error {
	constructor() {
		super("Only Owners can manage Members.");
		this.name = "MemberManagementForbiddenError";
	}
}

export class MemberManagementInvalidError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MemberManagementInvalidError";
	}
}

export class MemberNotFoundError extends Error {
	constructor() {
		super("Member not found.");
		this.name = "MemberNotFoundError";
	}
}

export class LastOwnerError extends Error {
	constructor() {
		super("A Household must have at least one Owner.");
		this.name = "LastOwnerError";
	}
}

export class SoleMemberError extends Error {
	constructor() {
		super("The only Member cannot leave the Household.");
		this.name = "SoleMemberError";
	}
}

export type AssociatedHousehold = {
	id: string;
	name: string;
	role: "owner" | "member";
	isActive: boolean;
};

export type MemberService = {
	findOldestActiveMembership(userId: string): Promise<ActiveMembership | null>;
	findActiveMembership(input: {
		userId: string;
		householdId: string;
	}): Promise<ActiveMembership | null>;
	listAssociatedHouseholds(input: {
		userId: string;
		activeHouseholdId: string;
	}): Promise<AssociatedHousehold[]>;
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
	removeMember(input: {
		householdId: string;
		membershipId: string;
		requestedByUserId: string;
	}): Promise<void>;
	changeMemberRole(input: {
		householdId: string;
		membershipId: string;
		role: "owner" | "member";
		requestedByUserId: string;
	}): Promise<void>;
	leaveHousehold(input: {
		householdId: string;
		userId: string;
	}): Promise<{ promotedMembershipId: string | null }>;
};

export type MemberServiceDeps = {
	directory: MemberServiceDirectory;
	analytics?: ServiceAnalytics;
};

export function createMemberService(deps: MemberServiceDeps): MemberService {
	const analytics = deps.analytics ?? serverServiceAnalytics;
	return {
		findOldestActiveMembership(userId) {
			return findOldestActiveMembership(userId, deps.directory);
		},
		findActiveMembership(input) {
			return findActiveMembership(input, deps.directory);
		},
		listAssociatedHouseholds(input) {
			return listAssociatedHouseholds(input, deps.directory);
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
		async removeMember(input) {
			await runDirectoryTransaction(deps.directory, (tx) =>
				removeMemberInTransaction(input, tx),
			);
			analytics.track("member_removed", {
				household_id: input.householdId,
				membership_id: input.membershipId,
				requested_by_user_id: input.requestedByUserId,
			});
		},
		async changeMemberRole(input) {
			const changed = await runDirectoryTransaction(deps.directory, (tx) =>
				changeMemberRoleInTransaction(input, tx),
			);
			if (changed) {
				analytics.track("member_role_changed", {
					household_id: input.householdId,
					membership_id: input.membershipId,
					role: input.role,
					requested_by_user_id: input.requestedByUserId,
				});
			}
		},
		async leaveHousehold(input) {
			const result = await runDirectoryTransaction(deps.directory, (tx) =>
				leaveHouseholdInTransaction(input, tx),
			);
			analytics.track("household_left", {
				household_id: input.householdId,
				user_id: input.userId,
				promoted_membership_id: result.promotedMembershipId,
			});
			return result;
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

async function findActiveMembership(
	input: { userId: string; householdId: string },
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
				eq(memberships.userId, input.userId),
				eq(memberships.householdId, input.householdId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return row ?? null;
}

async function listAssociatedHouseholds(
	input: { userId: string; activeHouseholdId: string },
	directory: MemberServiceDirectory,
): Promise<AssociatedHousehold[]> {
	const rows = await directory
		.select({
			id: households.id,
			name: households.name,
			role: memberships.role,
			joinedAt: memberships.joinedAt,
		})
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.userId, input.userId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.orderBy(asc(memberships.joinedAt), asc(memberships.id));

	return rows.map(({ joinedAt: _joinedAt, ...row }) => ({
		...row,
		isActive: row.id === input.activeHouseholdId,
	}));
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

	const [inserted] = await directory
		.insert(memberships)
		.values(membership)
		.onConflictDoNothing()
		.returning();
	if (inserted) return { membership: inserted, created: true };

	const createdByConcurrentRequest = await findActiveMembershipRow(
		input,
		directory,
	);
	if (createdByConcurrentRequest) {
		return { membership: createdByConcurrentRequest, created: false };
	}
	throw new Error(
		"Suppressed membership insert conflict left no active Membership row.",
	);
}

async function findActiveMembershipRow(
	input: { householdId: string; userId: string },
	directory: MemberServiceDirectory,
): Promise<Membership | null> {
	const [existing] = await directory
		.select()
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

	return existing?.memberships ?? null;
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
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.householdId, householdId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.orderBy(asc(memberships.joinedAt), asc(memberships.id));

	return rows.map(({ joinedAt: _joinedAt, ...row }) => row);
}

async function removeMemberInTransaction(
	input: {
		householdId: string;
		membershipId: string;
		requestedByUserId: string;
	},
	directory: MemberServiceDirectory,
): Promise<void> {
	await lockHouseholdRow(directory, input.householdId);

	const requester = await findActiveMembershipRow(
		{
			householdId: input.householdId,
			userId: input.requestedByUserId,
		},
		directory,
	);
	if (requester?.role !== "owner") {
		throw new MemberManagementForbiddenError();
	}

	const target = await findActiveMembershipById(
		{
			householdId: input.householdId,
			membershipId: input.membershipId,
		},
		directory,
	);
	if (!target) throw new MemberNotFoundError();
	if (target.userId === input.requestedByUserId) {
		throw new MemberManagementInvalidError(
			"Use Leave Household to remove your own Membership.",
		);
	}

	const activeMembers = await listActiveMembershipRows(
		input.householdId,
		directory,
	);
	if (
		target.role === "owner" &&
		activeMembers.some((member) => member.id !== target.id) &&
		!activeMembers.some(
			(member) => member.id !== target.id && member.role === "owner",
		)
	) {
		throw new LastOwnerError();
	}

	await directory
		.update(memberships)
		.set({ removedAt: Date.now() })
		.where(eq(memberships.id, target.id));
}

async function changeMemberRoleInTransaction(
	input: {
		householdId: string;
		membershipId: string;
		role: "owner" | "member";
		requestedByUserId: string;
	},
	directory: MemberServiceDirectory,
): Promise<boolean> {
	await lockHouseholdRow(directory, input.householdId);

	const requester = await findActiveMembershipRow(
		{
			householdId: input.householdId,
			userId: input.requestedByUserId,
		},
		directory,
	);
	if (requester?.role !== "owner") {
		throw new MemberManagementForbiddenError();
	}

	const target = await findActiveMembershipById(
		{
			householdId: input.householdId,
			membershipId: input.membershipId,
		},
		directory,
	);
	if (!target) throw new MemberNotFoundError();
	if (target.role === input.role) return false;

	const activeMembers = await listActiveMembershipRows(
		input.householdId,
		directory,
	);
	if (
		target.role === "owner" &&
		input.role === "member" &&
		!activeMembers.some(
			(member) => member.id !== target.id && member.role === "owner",
		)
	) {
		throw new LastOwnerError();
	}

	await directory
		.update(memberships)
		.set({ role: input.role })
		.where(eq(memberships.id, target.id));
	return true;
}

async function leaveHouseholdInTransaction(
	input: { householdId: string; userId: string },
	directory: MemberServiceDirectory,
): Promise<{ promotedMembershipId: string | null }> {
	await lockHouseholdRow(directory, input.householdId);

	const membership = await findActiveMembershipRow(input, directory);
	if (!membership) throw new MemberNotFoundError();

	const activeMembers = await listActiveMembershipRows(
		input.householdId,
		directory,
	);
	const remainingMembers = activeMembers.filter(
		(member) => member.id !== membership.id,
	);
	if (remainingMembers.length === 0) throw new SoleMemberError();

	let promotedMembershipId: string | null = null;
	if (
		membership.role === "owner" &&
		!remainingMembers.some((member) => member.role === "owner")
	) {
		const [promoted] = remainingMembers;
		if (!promoted) throw new SoleMemberError();
		await directory
			.update(memberships)
			.set({ role: "owner" })
			.where(eq(memberships.id, promoted.id));
		promotedMembershipId = promoted.id;
	}

	await directory
		.update(memberships)
		.set({ removedAt: Date.now() })
		.where(eq(memberships.id, membership.id));

	return { promotedMembershipId };
}

async function findActiveMembershipById(
	input: { householdId: string; membershipId: string },
	directory: MemberServiceDirectory,
): Promise<Membership | null> {
	const [membership] = await directory
		.select()
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.householdId, input.householdId),
				eq(memberships.id, input.membershipId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.limit(1);

	return membership?.memberships ?? null;
}

async function listActiveMembershipRows(
	householdId: string,
	directory: MemberServiceDirectory,
): Promise<Membership[]> {
	return directory
		.select()
		.from(memberships)
		.innerJoin(households, eq(households.id, memberships.householdId))
		.where(
			and(
				eq(memberships.householdId, householdId),
				isNull(memberships.removedAt),
				isNull(households.deletedAt),
			),
		)
		.orderBy(asc(memberships.joinedAt), asc(memberships.id))
		.then((rows) => rows.map((row) => row.memberships));
}

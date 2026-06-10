import { eq } from "drizzle-orm";

import type { DirectoryDb, HouseholdDb } from "@/db/client";
import {
	householdJoinCodeAttempts,
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	memberships,
	users,
} from "@/db/schema/directory";
import { itemChecks, items, lists } from "@/db/schema/household";
import {
	householdFixture,
	householdJoinCodeAttemptFixture,
	householdJoinCodeFixture,
	householdJoinCodeUseFixture,
	invitationFixture,
	itemCheckFixture,
	itemFixture,
	listFixture,
	membershipFixture,
	PRIMARY_HOUSEHOLD_SEED,
	userFixture,
} from "./builders";

type PrimaryHouseholdScenarioOptions = {
	now?: number;
	householdTursoDbName?: string;
};

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

function buildPrimaryDirectoryHouseholdFacts(input: {
	now: number;
	includeCameron?: boolean;
	blakeJoinedAt?: number;
	cameronJoinedAt?: number;
}) {
	const { now } = input;
	const avery = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.avery,
		createdAt: now,
		updatedAt: now,
	});
	const blake = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.blake,
		createdAt: now,
		updatedAt: now,
	});
	const cameron = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.cameron,
		createdAt: now,
		updatedAt: now,
	});
	const household = householdFixture({
		...PRIMARY_HOUSEHOLD_SEED.household,
		createdByUserId: avery.id,
		provisioningCompletedAt: now,
		createdAt: now,
	});
	const averyMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
		householdId: household.id,
		userId: avery.id,
		role: "owner",
		joinedAt: now,
	});
	const blakeMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
		householdId: household.id,
		userId: blake.id,
		role: "member",
		joinedAt: input.blakeJoinedAt ?? now + 1,
	});
	const cameronMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.cameron.id,
		householdId: household.id,
		userId: cameron.id,
		role: "member",
		joinedAt: input.cameronJoinedAt ?? now + 2,
	});
	const userRows = input.includeCameron
		? [avery, blake, cameron]
		: [avery, blake];
	const memberRows = input.includeCameron
		? [averyMembership, blakeMembership, cameronMembership]
		: [averyMembership, blakeMembership];

	return {
		users: { avery, blake, cameron },
		activeUsers: {
			avery: { ...avery, activeHouseholdId: household.id },
			blake: { ...blake, activeHouseholdId: household.id },
			cameron: { ...cameron, activeHouseholdId: household.id },
		},
		household,
		members: {
			avery: averyMembership,
			blake: blakeMembership,
			cameron: cameronMembership,
		},
		memberships: {
			avery: averyMembership,
			blake: blakeMembership,
			cameron: cameronMembership,
		},
		rows: {
			users: userRows,
			memberships: memberRows,
		},
	};
}

async function setActiveHouseholdForUsers(
	tx: DirectoryTransaction,
	userIds: readonly string[],
	householdId: string,
) {
	for (const userId of userIds) {
		await tx
			.update(users)
			.set({ activeHouseholdId: householdId })
			.where(eq(users.id, userId));
	}
}

export type PrimaryHouseholdScenario = Awaited<
	ReturnType<typeof seedPrimaryHouseholdScenario>
>;

export async function seedPrimaryHouseholdScenario(
	input: {
		directory: DirectoryDb;
		household: HouseholdDb;
	} & PrimaryHouseholdScenarioOptions,
) {
	const now = input.now ?? PRIMARY_HOUSEHOLD_SEED.now;
	const avery = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.avery,
		createdAt: now,
		updatedAt: now,
	});
	const blake = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.blake,
		createdAt: now,
		updatedAt: now,
	});
	const household = householdFixture({
		...PRIMARY_HOUSEHOLD_SEED.household,
		tursoDbName:
			input.householdTursoDbName ??
			PRIMARY_HOUSEHOLD_SEED.household.tursoDbName,
		createdByUserId: avery.id,
		provisioningCompletedAt: now,
		createdAt: now,
	});
	const averyMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
		householdId: household.id,
		userId: avery.id,
		role: "owner",
		joinedAt: now,
	});
	const blakeMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
		householdId: household.id,
		userId: blake.id,
		role: "member",
		joinedAt: now + 1,
	});
	const joinCode = householdJoinCodeFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 2,
	});
	const groceries = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.groceries.name,
		createdByUserId: avery.id,
		createdAt: now,
		updatedAt: now,
	});
	const hardware = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.hardware.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.hardware.name,
		createdByUserId: avery.id,
		createdAt: now + 1,
		updatedAt: now + 1,
	});
	const pharmacy = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.pharmacy.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.pharmacy.name,
		createdByUserId: blake.id,
		createdAt: now + 2,
		updatedAt: now + 2,
	});
	const archivedList = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.archived.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.archived.name,
		createdByUserId: avery.id,
		createdAt: now + 3,
		updatedAt: now + 60,
		archivedAt: now + 60,
	});
	const deletedList = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.deleted.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.deleted.name,
		createdByUserId: avery.id,
		createdAt: now + 4,
		updatedAt: now + 70,
		deletedAt: now + 70,
	});
	const uncheckedItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.unchecked.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.unchecked.name,
		position: 0,
		createdByUserId: avery.id,
		createdAt: now + 10,
		updatedAt: now + 10,
	});
	const checkedByAveryItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.checkedByAvery.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.checkedByAvery.name,
		position: 1,
		createdByUserId: avery.id,
		createdAt: now + 20,
		updatedAt: now + 20,
	});
	const checkedByBlakeItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.checkedByBlake.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.checkedByBlake.name,
		position: 2,
		createdByUserId: blake.id,
		createdAt: now + 30,
		updatedAt: now + 30,
	});
	const tombstonedItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.tombstoned.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.tombstoned.name,
		position: 3,
		createdByUserId: avery.id,
		createdAt: now + 40,
		updatedAt: now + 50,
		deletedAt: now + 50,
	});
	const checkedByAvery = itemCheckFixture({
		itemId: checkedByAveryItem.id,
		userId: avery.id,
		checkedAt: now + 100,
		updatedAt: now + 100,
	});
	const checkedByBlake = itemCheckFixture({
		itemId: checkedByBlakeItem.id,
		userId: blake.id,
		checkedAt: now + 110,
		updatedAt: now + 110,
	});

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values([avery, blake]);
		await tx.insert(households).values(household);
		await tx.insert(memberships).values([averyMembership, blakeMembership]);
		await tx.insert(householdJoinCodes).values(joinCode);
		await tx
			.update(users)
			.set({ activeHouseholdId: household.id })
			.where(eq(users.id, avery.id));
		await tx
			.update(users)
			.set({ activeHouseholdId: household.id })
			.where(eq(users.id, blake.id));
	});
	await input.household.transaction(async (tx) => {
		await tx
			.insert(lists)
			.values([groceries, hardware, pharmacy, archivedList, deletedList]);
		await tx
			.insert(items)
			.values([
				uncheckedItem,
				checkedByAveryItem,
				checkedByBlakeItem,
				tombstonedItem,
			]);
		await tx.insert(itemChecks).values([checkedByAvery, checkedByBlake]);
	});

	return {
		users: {
			avery: { ...avery, activeHouseholdId: household.id },
			blake: { ...blake, activeHouseholdId: household.id },
		},
		household,
		members: { avery: averyMembership, blake: blakeMembership },
		memberships: { avery: averyMembership, blake: blakeMembership },
		joinCodes: { active: joinCode },
		lists: {
			groceries,
			hardware,
			pharmacy,
			archived: archivedList,
			deleted: deletedList,
		},
		items: {
			unchecked: uncheckedItem,
			checkedByAvery: checkedByAveryItem,
			checkedByBlake: checkedByBlakeItem,
			tombstoned: tombstonedItem,
		},
		itemChecks: { checkedByAvery, checkedByBlake },
		ids: {
			averyUserId: avery.id,
			blakeUserId: blake.id,
			householdId: household.id,
			groceriesListId: groceries.id,
		},
	};
}

export type MultiHouseholdUserScenario = Awaited<
	ReturnType<typeof seedMultiHouseholdUserScenario>
>;

export async function seedMultiHouseholdUserScenario(input: {
	directory: DirectoryDb;
	now?: number;
}) {
	const now = input.now ?? PRIMARY_HOUSEHOLD_SEED.now;
	const avery = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.avery,
		createdAt: now,
		updatedAt: now,
	});
	const blake = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.blake,
		createdAt: now,
		updatedAt: now,
	});
	const primaryHousehold = householdFixture({
		...PRIMARY_HOUSEHOLD_SEED.household,
		createdByUserId: avery.id,
		provisioningCompletedAt: now,
		createdAt: now,
	});
	const secondHousehold = householdFixture({
		id: "hh_cedar",
		name: "Cedar",
		tursoDbName: "df-local-hh-seed-cedar",
		createdByUserId: avery.id,
		provisioningCompletedAt: now + 10,
		createdAt: now + 10,
	});
	const primaryOwnerMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
		householdId: primaryHousehold.id,
		userId: avery.id,
		role: "owner",
		joinedAt: now,
	});
	const secondOwnerMembership = membershipFixture({
		id: "mbr_avery_cedar",
		householdId: secondHousehold.id,
		userId: avery.id,
		role: "owner",
		joinedAt: now + 11,
	});
	const secondMemberMembership = membershipFixture({
		id: "mbr_blake_cedar",
		householdId: secondHousehold.id,
		userId: blake.id,
		role: "member",
		joinedAt: now + 12,
	});
	const primaryJoinCode = householdJoinCodeFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		householdId: primaryHousehold.id,
		code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
		createdByUserId: avery.id,
		createdAt: now + 1,
	});
	const secondJoinCode = householdJoinCodeFixture({
		id: "hjc_cedar_active",
		householdId: secondHousehold.id,
		code: "23456789",
		createdByUserId: avery.id,
		createdAt: now + 13,
	});

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values([avery, blake]);
		await tx.insert(households).values([primaryHousehold, secondHousehold]);
		await tx
			.insert(memberships)
			.values([
				primaryOwnerMembership,
				secondOwnerMembership,
				secondMemberMembership,
			]);
		await tx
			.insert(householdJoinCodes)
			.values([primaryJoinCode, secondJoinCode]);
		await tx
			.update(users)
			.set({ activeHouseholdId: secondHousehold.id })
			.where(eq(users.id, avery.id));
		await tx
			.update(users)
			.set({ activeHouseholdId: secondHousehold.id })
			.where(eq(users.id, blake.id));
	});

	return {
		users: {
			avery: { ...avery, activeHouseholdId: secondHousehold.id },
			blake: { ...blake, activeHouseholdId: secondHousehold.id },
		},
		households: {
			primary: primaryHousehold,
			second: secondHousehold,
		},
		memberships: {
			primaryOwner: primaryOwnerMembership,
			secondOwner: secondOwnerMembership,
			secondMember: secondMemberMembership,
		},
		joinCodes: {
			primary: primaryJoinCode,
			second: secondJoinCode,
		},
		ids: {
			averyUserId: avery.id,
			blakeUserId: blake.id,
			activeHouseholdId: secondHousehold.id,
		},
	};
}

export type InvitationVariantsScenario = Awaited<
	ReturnType<typeof seedInvitationVariantsScenario>
>;

export async function seedInvitationVariantsScenario(input: {
	directory: DirectoryDb;
	now?: number;
}) {
	const now = input.now ?? PRIMARY_HOUSEHOLD_SEED.now;
	const facts = buildPrimaryDirectoryHouseholdFacts({ now });
	const { avery, blake } = facts.users;
	const { household } = facts;
	const pendingEmail = invitationFixture({
		...PRIMARY_HOUSEHOLD_SEED.invitations.pendingEmail,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 10,
		expiresAt: now + 7 * 24 * 60 * 60 * 1000,
	});
	const pendingLink = invitationFixture({
		id: PRIMARY_HOUSEHOLD_SEED.invitations.pendingLink.id,
		token: PRIMARY_HOUSEHOLD_SEED.invitations.pendingLink.token,
		email: null,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 20,
		expiresAt: now + 7 * 24 * 60 * 60 * 1000,
	});
	const accepted = invitationFixture({
		...PRIMARY_HOUSEHOLD_SEED.invitations.accepted,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 30,
		expiresAt: now + 7 * 24 * 60 * 60 * 1000,
		acceptedAt: now + 40,
		acceptedByUserId: blake.id,
	});
	const revoked = invitationFixture({
		...PRIMARY_HOUSEHOLD_SEED.invitations.revoked,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 50,
		expiresAt: now + 7 * 24 * 60 * 60 * 1000,
		revokedAt: now + 60,
	});
	const expired = invitationFixture({
		...PRIMARY_HOUSEHOLD_SEED.invitations.expired,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now - 8 * 24 * 60 * 60 * 1000,
		expiresAt: now - 24 * 60 * 60 * 1000,
	});

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values(facts.rows.users);
		await tx.insert(households).values(household);
		await tx.insert(memberships).values(facts.rows.memberships);
		await tx
			.insert(invitations)
			.values([pendingEmail, pendingLink, accepted, revoked, expired]);
		await setActiveHouseholdForUsers(
			tx,
			facts.rows.users.map((user) => user.id),
			household.id,
		);
	});

	return {
		users: {
			avery: facts.activeUsers.avery,
			blake: facts.activeUsers.blake,
		},
		household,
		members: {
			avery: facts.members.avery,
			blake: facts.members.blake,
		},
		memberships: {
			avery: facts.memberships.avery,
			blake: facts.memberships.blake,
		},
		invitations: {
			pendingEmail,
			pendingLink,
			accepted,
			revoked,
			expired,
		},
		ids: {
			householdId: household.id,
			inviterUserId: avery.id,
			acceptedByUserId: blake.id,
		},
	};
}

export type HouseholdJoinCodeAuditScenario = Awaited<
	ReturnType<typeof seedHouseholdJoinCodeAuditScenario>
>;

export async function seedHouseholdJoinCodeAuditScenario(input: {
	directory: DirectoryDb;
	now?: number;
}) {
	const now = input.now ?? PRIMARY_HOUSEHOLD_SEED.now;
	const facts = buildPrimaryDirectoryHouseholdFacts({
		now,
		includeCameron: true,
		blakeJoinedAt: now + 10,
		cameronJoinedAt: now + 20,
	});
	const { avery, blake, cameron } = facts.users;
	const { household } = facts;
	const active = householdJoinCodeFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		householdId: household.id,
		code: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
		createdByUserId: avery.id,
		createdAt: now + 30,
	});
	const replaced = householdJoinCodeFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.replaced.id,
		householdId: household.id,
		code: PRIMARY_HOUSEHOLD_SEED.joinCodes.replaced.code,
		createdByUserId: avery.id,
		createdAt: now + 1,
		replacedAt: now + 29,
		replacedByUserId: avery.id,
	});
	const disabled = householdJoinCodeFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.disabled.id,
		householdId: household.id,
		code: PRIMARY_HOUSEHOLD_SEED.joinCodes.disabled.code,
		createdByUserId: avery.id,
		createdAt: now + 2,
		disabledAt: now + 28,
		disabledByUserId: avery.id,
	});
	const blakeUse = householdJoinCodeUseFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodeUses.blake.id,
		householdJoinCodeId: active.id,
		householdId: household.id,
		userId: blake.id,
		membershipId: facts.members.blake.id,
		usedAt: now + 40,
	});
	const cameronUse = householdJoinCodeUseFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodeUses.cameron.id,
		householdJoinCodeId: active.id,
		householdId: household.id,
		userId: cameron.id,
		membershipId: facts.members.cameron.id,
		usedAt: now + 41,
	});
	const blakeAttempt = householdJoinCodeAttemptFixture({
		userId: blake.id,
		failedCount: 2,
		windowStartedAt: now + 50,
		lastFailedAt: now + 51,
	});
	const cameronAttempt = householdJoinCodeAttemptFixture({
		userId: cameron.id,
		failedCount: 1,
		windowStartedAt: now + 52,
		lastFailedAt: now + 52,
	});

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values(facts.rows.users);
		await tx.insert(households).values(household);
		await tx.insert(memberships).values(facts.rows.memberships);
		await tx.insert(householdJoinCodes).values([active, replaced, disabled]);
		await tx.insert(householdJoinCodeUses).values([blakeUse, cameronUse]);
		await tx
			.insert(householdJoinCodeAttempts)
			.values([blakeAttempt, cameronAttempt]);
		await setActiveHouseholdForUsers(
			tx,
			facts.rows.users.map((user) => user.id),
			household.id,
		);
	});

	return {
		users: {
			avery: facts.activeUsers.avery,
			blake: facts.activeUsers.blake,
			cameron: facts.activeUsers.cameron,
		},
		household,
		members: {
			avery: facts.members.avery,
			blake: facts.members.blake,
			cameron: facts.members.cameron,
		},
		memberships: {
			avery: facts.memberships.avery,
			blake: facts.memberships.blake,
			cameron: facts.memberships.cameron,
		},
		joinCodes: {
			active,
			replaced,
			disabled,
		},
		joinCodeUses: {
			blake: blakeUse,
			cameron: cameronUse,
		},
		joinCodeAttempts: {
			blake: blakeAttempt,
			cameron: cameronAttempt,
		},
		ids: {
			householdId: household.id,
			activeJoinCodeId: active.id,
			blakeUserId: blake.id,
			cameronUserId: cameron.id,
		},
	};
}

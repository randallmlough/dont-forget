import { eq } from "drizzle-orm";
import type { DirectoryDb } from "../client";
import type { NewHousehold, NewMembership, NewUser } from "../schema/postgres";
import {
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	itemChecks,
	items,
	lists,
	memberships,
	users,
} from "../schema/postgres";
import {
	householdFixture,
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
};

export type EmailBackedPrimaryHouseholdScenarioSeed = {
	users: {
		avery: { id: string };
		blake: { id: string };
		cameron: { id: string; clerkUserId?: string; email?: string };
	};
	household: { id: string };
	memberships: {
		avery: { id: string };
		blake: { id: string };
		cameron: { id: string };
	};
	joinCode: { id: string; code: string };
	lists?: SeedIds<typeof PRIMARY_HOUSEHOLD_SEED.lists>;
	items?: SeedIds<typeof PRIMARY_HOUSEHOLD_SEED.items>;
};

type SeedIds<T extends Record<string, { id: string }>> = {
	[K in keyof T]: { id: string };
};

type DirectoryTransaction = Parameters<
	Parameters<DirectoryDb["transaction"]>[0]
>[0];

function buildPrimaryDirectoryHouseholdFacts(input: {
	now: number;
	includeCameron?: boolean;
	blakeJoinedAt?: number;
	cameronJoinedAt?: number;
	householdOverrides?: Partial<NewHousehold>;
	membershipOverrides?: {
		avery?: Partial<NewMembership>;
		blake?: Partial<NewMembership>;
		cameron?: Partial<NewMembership>;
	};
	userOverrides?: {
		avery?: Partial<NewUser>;
		blake?: Partial<NewUser>;
		cameron?: Partial<NewUser>;
	};
}) {
	const { now } = input;
	const avery = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.avery,
		...input.userOverrides?.avery,
		createdAt: now,
		updatedAt: now,
	});
	const blake = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.blake,
		...input.userOverrides?.blake,
		createdAt: now,
		updatedAt: now,
	});
	const cameron = userFixture({
		...PRIMARY_HOUSEHOLD_SEED.users.cameron,
		...input.userOverrides?.cameron,
		createdAt: now,
		updatedAt: now,
	});
	const household = householdFixture({
		...PRIMARY_HOUSEHOLD_SEED.household,
		...input.householdOverrides,
		createdByUserId: avery.id,
		createdAt: now,
	});
	const averyMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
		...input.membershipOverrides?.avery,
		householdId: household.id,
		userId: avery.id,
		role: "owner",
		joinedAt: now,
	});
	const blakeMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
		...input.membershipOverrides?.blake,
		householdId: household.id,
		userId: blake.id,
		role: "member",
		joinedAt: input.blakeJoinedAt ?? now + 1,
	});
	const cameronMembership = membershipFixture({
		id: PRIMARY_HOUSEHOLD_SEED.memberships.cameron.id,
		...input.membershipOverrides?.cameron,
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
	} & PrimaryHouseholdScenarioOptions,
) {
	const now = input.now ?? PRIMARY_HOUSEHOLD_SEED.now;
	const facts = buildPrimaryDirectoryHouseholdFacts({
		now,
	});
	const { avery, blake } = facts.users;
	const { household } = facts;
	const joinCode = householdJoinCodeFixture({
		id: PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 2,
	});
	const groceries = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.groceries.id,
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.groceries.name,
		createdByUserId: avery.id,
		createdAt: new Date(now),
		updatedAt: new Date(now),
	});
	const hardware = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.hardware.id,
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.hardware.name,
		createdByUserId: avery.id,
		createdAt: new Date(now + 1),
		updatedAt: new Date(now + 1),
	});
	const pharmacy = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.pharmacy.id,
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.pharmacy.name,
		createdByUserId: blake.id,
		createdAt: new Date(now + 2),
		updatedAt: new Date(now + 2),
	});
	const archivedList = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.archived.id,
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.archived.name,
		createdByUserId: avery.id,
		createdAt: new Date(now + 3),
		updatedAt: new Date(now + 60),
		archivedAt: new Date(now + 60),
	});
	const deletedList = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.lists.deleted.id,
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.deleted.name,
		createdByUserId: avery.id,
		createdAt: new Date(now + 4),
		updatedAt: new Date(now + 70),
		deletedAt: new Date(now + 70),
	});
	const uncheckedItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.unchecked.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.unchecked.name,
		position: 0,
		createdByUserId: avery.id,
		createdAt: new Date(now + 10),
		updatedAt: new Date(now + 10),
	});
	const checkedByAveryItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.checkedByAvery.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.checkedByAvery.name,
		position: 1,
		createdByUserId: avery.id,
		createdAt: new Date(now + 20),
		updatedAt: new Date(now + 20),
	});
	const checkedByBlakeItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.checkedByBlake.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.checkedByBlake.name,
		position: 2,
		createdByUserId: blake.id,
		createdAt: new Date(now + 30),
		updatedAt: new Date(now + 30),
	});
	const tombstonedItem = itemFixture({
		id: PRIMARY_HOUSEHOLD_SEED.items.tombstoned.id,
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.tombstoned.name,
		position: 3,
		createdByUserId: avery.id,
		createdAt: new Date(now + 40),
		updatedAt: new Date(now + 50),
		deletedAt: new Date(now + 50),
	});
	const checkedByAvery = itemCheckFixture({
		id: "chk_seed_eggs",
		itemId: checkedByAveryItem.id,
		checkedByUserId: avery.id,
		checkedAt: new Date(now + 100),
		updatedAt: new Date(now + 100),
	});
	const checkedByBlake = itemCheckFixture({
		id: "chk_seed_bread",
		itemId: checkedByBlakeItem.id,
		checkedByUserId: blake.id,
		checkedAt: new Date(now + 110),
		updatedAt: new Date(now + 110),
	});

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values(facts.rows.users);
		await tx.insert(households).values(household);
		await tx.insert(memberships).values(facts.rows.memberships);
		await tx.insert(householdJoinCodes).values(joinCode);
		await setActiveHouseholdForUsers(
			tx,
			facts.rows.users.map((user) => user.id),
			household.id,
		);
	});
	await input.directory.transaction(async (tx) => {
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
			avery: facts.activeUsers.avery,
			blake: facts.activeUsers.blake,
		},
		household,
		members: { avery: facts.members.avery, blake: facts.members.blake },
		memberships: {
			avery: facts.memberships.avery,
			blake: facts.memberships.blake,
		},
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

export type EmailBackedPrimaryHouseholdScenario = Awaited<
	ReturnType<typeof seedEmailBackedPrimaryHouseholdScenario>
>;

export async function seedEmailBackedPrimaryHouseholdScenario(
	input: {
		directory: DirectoryDb;
		ownerClerkUserId: string;
		ownerEmail: string;
		memberClerkUserId: string;
		memberEmail: string;
		seed?: EmailBackedPrimaryHouseholdScenarioSeed;
	} & PrimaryHouseholdScenarioOptions,
) {
	const now = input.now ?? PRIMARY_HOUSEHOLD_SEED.now;
	const seed = input.seed;
	const facts = buildPrimaryDirectoryHouseholdFacts({
		now,
		includeCameron: true,
		householdOverrides: seed
			? {
					id: seed.household.id,
				}
			: undefined,
		membershipOverrides: seed
			? {
					avery: { id: seed.memberships.avery.id },
					blake: { id: seed.memberships.blake.id },
					cameron: { id: seed.memberships.cameron.id },
				}
			: undefined,
		userOverrides: {
			avery: {
				...(seed ? { id: seed.users.avery.id } : {}),
				clerkUserId: input.ownerClerkUserId,
				email: input.ownerEmail,
				firstName: "Seed",
				lastName: "Owner",
				displayName: "Seed Owner",
			},
			blake: {
				...(seed ? { id: seed.users.blake.id } : {}),
				clerkUserId: input.memberClerkUserId,
				email: input.memberEmail,
				firstName: "Seed",
				lastName: "Member",
				displayName: "Seed Member",
			},
			cameron: seed
				? emailBackedCameronUserOverrides(seed.users.cameron)
				: undefined,
		},
	});
	const { avery, blake } = facts.users;
	const { household } = facts;
	const joinCode = householdJoinCodeFixture({
		id: seed?.joinCode.id ?? PRIMARY_HOUSEHOLD_SEED.joinCodes.active.id,
		code: seed?.joinCode.code ?? PRIMARY_HOUSEHOLD_SEED.joinCodes.active.code,
		householdId: household.id,
		createdByUserId: avery.id,
		createdAt: now + 2,
	});
	const groceries = listFixture({
		id: seedListId(seed, "groceries"),
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.groceries.name,
		createdByUserId: avery.id,
		createdAt: new Date(now),
		updatedAt: new Date(now),
	});
	const hardware = listFixture({
		id: seedListId(seed, "hardware"),
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.hardware.name,
		createdByUserId: avery.id,
		createdAt: new Date(now + 1),
		updatedAt: new Date(now + 1),
	});
	const pharmacy = listFixture({
		id: seedListId(seed, "pharmacy"),
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.pharmacy.name,
		createdByUserId: blake.id,
		createdAt: new Date(now + 2),
		updatedAt: new Date(now + 2),
	});
	const archivedList = listFixture({
		id: seedListId(seed, "archived"),
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.archived.name,
		createdByUserId: avery.id,
		createdAt: new Date(now + 3),
		updatedAt: new Date(now + 60),
		archivedAt: new Date(now + 60),
	});
	const deletedList = listFixture({
		id: seedListId(seed, "deleted"),
		householdId: household.id,
		name: PRIMARY_HOUSEHOLD_SEED.lists.deleted.name,
		createdByUserId: avery.id,
		createdAt: new Date(now + 4),
		updatedAt: new Date(now + 70),
		deletedAt: new Date(now + 70),
	});
	const uncheckedItem = itemFixture({
		id: seedItemId(seed, "unchecked"),
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.unchecked.name,
		position: 0,
		createdByUserId: avery.id,
		createdAt: new Date(now + 10),
		updatedAt: new Date(now + 10),
	});
	const checkedByAveryItem = itemFixture({
		id: seedItemId(seed, "checkedByAvery"),
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.checkedByAvery.name,
		position: 1,
		createdByUserId: avery.id,
		createdAt: new Date(now + 20),
		updatedAt: new Date(now + 20),
	});
	const checkedByBlakeItem = itemFixture({
		id: seedItemId(seed, "checkedByBlake"),
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.checkedByBlake.name,
		position: 2,
		createdByUserId: blake.id,
		createdAt: new Date(now + 30),
		updatedAt: new Date(now + 30),
	});
	const tombstonedItem = itemFixture({
		id: seedItemId(seed, "tombstoned"),
		listId: groceries.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.tombstoned.name,
		position: 3,
		createdByUserId: avery.id,
		createdAt: new Date(now + 40),
		updatedAt: new Date(now + 50),
		deletedAt: new Date(now + 50),
	});
	const hardwareBatteries = itemFixture({
		id: seedItemId(seed, "hardwareBatteries"),
		listId: hardware.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.hardwareBatteries.name,
		position: 0,
		createdByUserId: avery.id,
		createdAt: new Date(now + 11),
		updatedAt: new Date(now + 11),
	});
	const hardwarePaintersTape = itemFixture({
		id: seedItemId(seed, "hardwarePaintersTape"),
		listId: hardware.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.hardwarePaintersTape.name,
		position: 1,
		createdByUserId: blake.id,
		createdAt: new Date(now + 21),
		updatedAt: new Date(now + 21),
	});
	const hardwareLightBulbs = itemFixture({
		id: seedItemId(seed, "hardwareLightBulbs"),
		listId: hardware.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.hardwareLightBulbs.name,
		position: 2,
		createdByUserId: avery.id,
		createdAt: new Date(now + 31),
		updatedAt: new Date(now + 31),
	});
	const pharmacyIbuprofen = itemFixture({
		id: seedItemId(seed, "pharmacyIbuprofen"),
		listId: pharmacy.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.pharmacyIbuprofen.name,
		position: 0,
		createdByUserId: blake.id,
		createdAt: new Date(now + 12),
		updatedAt: new Date(now + 12),
	});
	const pharmacyBandages = itemFixture({
		id: seedItemId(seed, "pharmacyBandages"),
		listId: pharmacy.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.pharmacyBandages.name,
		position: 1,
		createdByUserId: avery.id,
		createdAt: new Date(now + 22),
		updatedAt: new Date(now + 22),
	});
	const pharmacyAllergyTablets = itemFixture({
		id: seedItemId(seed, "pharmacyAllergyTablets"),
		listId: pharmacy.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.pharmacyAllergyTablets.name,
		position: 2,
		createdByUserId: blake.id,
		createdAt: new Date(now + 32),
		updatedAt: new Date(now + 32),
	});
	const archivedCranberrySauce = itemFixture({
		id: seedItemId(seed, "archivedCranberrySauce"),
		listId: archivedList.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.archivedCranberrySauce.name,
		position: 0,
		createdByUserId: avery.id,
		createdAt: new Date(now + 13),
		updatedAt: new Date(now + 13),
	});
	const archivedPieCrust = itemFixture({
		id: seedItemId(seed, "archivedPieCrust"),
		listId: archivedList.id,
		name: PRIMARY_HOUSEHOLD_SEED.items.archivedPieCrust.name,
		position: 1,
		createdByUserId: blake.id,
		createdAt: new Date(now + 23),
		updatedAt: new Date(now + 23),
	});
	const checkedByAvery = itemCheckFixture({
		id: seedItemCheckId(seed, "checkedByAvery"),
		itemId: checkedByAveryItem.id,
		checkedByUserId: avery.id,
		checkedAt: new Date(now + 100),
		updatedAt: new Date(now + 100),
	});
	const checkedByBlake = itemCheckFixture({
		id: seedItemCheckId(seed, "checkedByBlake"),
		itemId: checkedByBlakeItem.id,
		checkedByUserId: blake.id,
		checkedAt: new Date(now + 110),
		updatedAt: new Date(now + 110),
	});
	const hardwareCheckedByBlake = itemCheckFixture({
		id: seedItemCheckId(seed, "hardwareLightBulbs"),
		itemId: hardwareLightBulbs.id,
		checkedByUserId: blake.id,
		checkedAt: new Date(now + 120),
		updatedAt: new Date(now + 120),
	});

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values(facts.rows.users);
		await tx.insert(households).values(household);
		await tx.insert(memberships).values(facts.rows.memberships);
		await tx.insert(householdJoinCodes).values(joinCode);
		await setActiveHouseholdForUsers(
			tx,
			facts.rows.users.map((user) => user.id),
			household.id,
		);
	});
	await input.directory.transaction(async (tx) => {
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
				hardwareBatteries,
				hardwarePaintersTape,
				hardwareLightBulbs,
				pharmacyIbuprofen,
				pharmacyBandages,
				pharmacyAllergyTablets,
				archivedCranberrySauce,
				archivedPieCrust,
			]);
		await tx
			.insert(itemChecks)
			.values([checkedByAvery, checkedByBlake, hardwareCheckedByBlake]);
	});

	return {
		users: facts.activeUsers,
		household,
		members: facts.members,
		memberships: facts.memberships,
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
			hardwareBatteries,
			hardwarePaintersTape,
			hardwareLightBulbs,
			pharmacyIbuprofen,
			pharmacyBandages,
			pharmacyAllergyTablets,
			archivedCranberrySauce,
			archivedPieCrust,
		},
		itemChecks: { checkedByAvery, checkedByBlake, hardwareCheckedByBlake },
		ids: {
			averyUserId: avery.id,
			blakeUserId: blake.id,
			cameronUserId: facts.users.cameron.id,
			householdId: household.id,
			groceriesListId: groceries.id,
		},
	};
}

function emailBackedCameronUserOverrides(
	seedUser: EmailBackedPrimaryHouseholdScenarioSeed["users"]["cameron"],
): Partial<NewUser> {
	return {
		id: seedUser.id,
		clerkUserId: seedUser.clerkUserId ?? syntheticClerkUserId(seedUser.id),
		email: seedUser.email ?? `${seedUser.id}@example.com`,
	};
}

function seedListId(
	seed: EmailBackedPrimaryHouseholdScenarioSeed | undefined,
	key: keyof typeof PRIMARY_HOUSEHOLD_SEED.lists,
): string {
	const defaultId = PRIMARY_HOUSEHOLD_SEED.lists[key].id;
	return seed?.lists?.[key]?.id ?? scopedSeedId(seed, defaultId);
}

function seedItemId(
	seed: EmailBackedPrimaryHouseholdScenarioSeed | undefined,
	key: keyof typeof PRIMARY_HOUSEHOLD_SEED.items,
): string {
	const defaultId = PRIMARY_HOUSEHOLD_SEED.items[key].id;
	return seed?.items?.[key]?.id ?? scopedSeedId(seed, defaultId);
}

function seedItemCheckId(
	seed: EmailBackedPrimaryHouseholdScenarioSeed | undefined,
	key: "checkedByAvery" | "checkedByBlake" | "hardwareLightBulbs",
): string {
	return scopedSeedId(seed, `chk_${PRIMARY_HOUSEHOLD_SEED.items[key].id}`);
}

function scopedSeedId(
	seed: EmailBackedPrimaryHouseholdScenarioSeed | undefined,
	defaultId: string,
): string {
	if (!seed) {
		return defaultId;
	}
	return `${defaultId}_${seed.household.id}`;
}

function syntheticClerkUserId(userId: string): string {
	if (userId.startsWith("usr_")) {
		return `user_${userId.slice("usr_".length)}`;
	}
	return `user_${userId}`;
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
		createdAt: now,
	});
	const secondHousehold = householdFixture({
		id: "hh_cedar",
		name: "Cedar",
		createdByUserId: avery.id,
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

	await input.directory.transaction(async (tx) => {
		await tx.insert(users).values(facts.rows.users);
		await tx.insert(households).values(household);
		await tx.insert(memberships).values(facts.rows.memberships);
		await tx.insert(householdJoinCodes).values([active, replaced, disabled]);
		await tx.insert(householdJoinCodeUses).values([blakeUse, cameronUse]);
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
		ids: {
			householdId: household.id,
			activeJoinCodeId: active.id,
			blakeUserId: blake.id,
			cameronUserId: cameron.id,
		},
	};
}

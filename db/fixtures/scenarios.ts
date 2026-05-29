import type { DirectoryDb, HouseholdDb } from "@/db/client";
import { households, memberships, users } from "@/db/schema/directory";
import { itemChecks, items, lists } from "@/db/schema/household";
import {
	householdFixture,
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
	const groceries = listFixture({
		id: PRIMARY_HOUSEHOLD_SEED.list.id,
		name: PRIMARY_HOUSEHOLD_SEED.list.name,
		createdByUserId: avery.id,
		createdAt: now,
		updatedAt: now,
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
	});
	await input.household.transaction(async (tx) => {
		await tx.insert(lists).values(groceries);
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
		users: { avery, blake },
		household,
		members: { avery: averyMembership, blake: blakeMembership },
		memberships: { avery: averyMembership, blake: blakeMembership },
		lists: { groceries },
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

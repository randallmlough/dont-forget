import { inArray, or } from "drizzle-orm";

import {
	directoryClient,
	directoryDb,
	householdClient,
	householdDb,
	householdDbUrl,
} from "@/db/client";
import {
	PRIMARY_HOUSEHOLD_SEED,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { households, memberships, users } from "@/db/schema/directory";
import { itemChecks, items, lists } from "@/db/schema/household";
import type { AppEnv } from "@/lib/env";
import { readTursoMigrationConfig } from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";

export async function seedLocalDatabases(): Promise<void> {
	const appEnv = loadEnvFile();
	assertLocalSeedEnvironment(appEnv);
	const config = readTursoMigrationConfig();
	const directoryClientInstance = directoryClient();
	const householdClientInstance = householdClient(
		householdDbUrl(PRIMARY_HOUSEHOLD_SEED.household.tursoDbName, config.org),
		config.platformGroupToken,
	);

	try {
		const directory = directoryDb(directoryClientInstance);
		const household = householdDb(householdClientInstance);
		await assertSeedDataDoesNotExist({ directory, household });
		const scenario = await seedPrimaryHouseholdScenario({
			directory,
			household,
			householdTursoDbName: PRIMARY_HOUSEHOLD_SEED.household.tursoDbName,
		});

		console.log(
			`[seed] Household ${scenario.household.id} (${scenario.household.name}) seeded`,
		);
		console.log(
			`[seed] Users: ${scenario.users.avery.email}, ${scenario.users.blake.email}`,
		);
		console.log(`[seed] List: ${scenario.lists.groceries.name}`);
	} finally {
		await householdClientInstance.close();
		await directoryClientInstance.close();
	}
}

export function assertLocalSeedEnvironment(appEnv: AppEnv): void {
	if (appEnv === "local") return;
	throw new Error(
		`Refusing to seed APP_ENV=${appEnv}. Local seed data is only allowed with APP_ENV=local.`,
	);
}

type SeedConflictDbs = {
	directory: ReturnType<typeof directoryDb>;
	household: ReturnType<typeof householdDb>;
};

async function assertSeedDataDoesNotExist({
	directory,
	household,
}: SeedConflictDbs): Promise<void> {
	const userIds = [
		PRIMARY_HOUSEHOLD_SEED.users.avery.id,
		PRIMARY_HOUSEHOLD_SEED.users.blake.id,
	];
	const clerkUserIds = [
		PRIMARY_HOUSEHOLD_SEED.users.avery.clerkUserId,
		PRIMARY_HOUSEHOLD_SEED.users.blake.clerkUserId,
	];
	const membershipIds = [
		PRIMARY_HOUSEHOLD_SEED.memberships.avery.id,
		PRIMARY_HOUSEHOLD_SEED.memberships.blake.id,
	];
	const itemIds = Object.values(PRIMARY_HOUSEHOLD_SEED.items).map(
		(item) => item.id,
	);

	const [existingUsers, existingHouseholds, existingMemberships] =
		await Promise.all([
			directory
				.select({ id: users.id })
				.from(users)
				.where(
					or(
						inArray(users.id, userIds),
						inArray(users.clerkUserId, clerkUserIds),
					),
				),
			directory
				.select({ id: households.id })
				.from(households)
				.where(
					or(
						inArray(households.id, [PRIMARY_HOUSEHOLD_SEED.household.id]),
						inArray(households.tursoDbName, [
							PRIMARY_HOUSEHOLD_SEED.household.tursoDbName,
						]),
					),
				),
			directory
				.select({ id: memberships.id })
				.from(memberships)
				.where(inArray(memberships.id, membershipIds)),
		]);
	const [existingLists, existingItems, existingItemChecks] = await Promise.all([
		household
			.select({ id: lists.id })
			.from(lists)
			.where(inArray(lists.id, [PRIMARY_HOUSEHOLD_SEED.list.id])),
		household
			.select({ id: items.id })
			.from(items)
			.where(inArray(items.id, itemIds)),
		household
			.select({ itemId: itemChecks.itemId })
			.from(itemChecks)
			.where(inArray(itemChecks.itemId, itemIds)),
	]);

	const conflicts = [
		existingUsers.length ? `${existingUsers.length} User row(s)` : null,
		existingHouseholds.length
			? `${existingHouseholds.length} Household row(s)`
			: null,
		existingMemberships.length
			? `${existingMemberships.length} Member row(s)`
			: null,
		existingLists.length ? `${existingLists.length} List row(s)` : null,
		existingItems.length ? `${existingItems.length} Item row(s)` : null,
		existingItemChecks.length
			? `${existingItemChecks.length} item_checks row(s)`
			: null,
	].filter(Boolean);

	if (conflicts.length > 0) {
		throw new Error(
			`Refusing to seed because deterministic seed data already exists: ${conflicts.join(", ")}. ` +
				"Run make db-reseed APP_ENV=local CONFIRM_DB_RESET=local for an explicit destructive rebuild.",
		);
	}
}

if (require.main === module) {
	seedLocalDatabases().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

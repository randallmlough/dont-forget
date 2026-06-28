import { migrate } from "drizzle-orm/node-postgres/migrator";

import { directoryClient, directoryDb } from "@/db/server/client";
import { PRIMARY_HOUSEHOLD_SEED } from "@/db/server/fixtures";
import { migrateHouseholdDb } from "@/db/server/household-migrations";
import {
	householdDatabasesForReset,
	resetDirectoryDatabase,
	resetHouseholdDatabaseByName,
} from "@/db/server/reset";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import {
	assertLocalDirectoryDatabaseUrl,
	readPostgresConfig,
	readTursoOperatorConfig,
} from "@/lib/env";
import {
	assertLocalSeedPrerequisites,
	ensureSeedHouseholdDatabase,
	readLocalSeedMode,
	seedLocalDatabasesForMode,
} from "./seed";
import { seedHouseholdDbNameForDirectory } from "./worktree-db";

const DIRECTORY_MIGRATIONS = "./db/migrations/postgres";

export async function reseedLocalDatabases(): Promise<void> {
	const seedMode = readLocalSeedMode();
	const config = readTursoOperatorConfig();
	assertLocalSeedPrerequisites({ seedMode, turso: config });
	assertLocalDirectoryDatabaseUrl(readPostgresConfig());
	const directoryClientInstance = directoryClient();

	try {
		const directory = directoryDb(directoryClientInstance);
		const householdDatabases = await householdDatabasesForReset(directory);
		for (const householdDatabase of householdDatabases) {
			await resetHouseholdDatabaseByName(householdDatabase.tursoDbName, config);
			console.log(`[households] ${householdDatabase.tursoDbName} reset`);
		}

		console.log("[directory] resetting app data");
		await resetDirectoryDatabase(directory);
		console.log("[directory] migrating");
		await migrate(directory, {
			migrationsFolder: DIRECTORY_MIGRATIONS,
			migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
		});
	} finally {
		await directoryClientInstance.end();
	}

	if (seedMode.kind === "deterministic") {
		const seedDbName =
			seedHouseholdDbNameForDirectory(config.directoryUrl, config.org) ??
			PRIMARY_HOUSEHOLD_SEED.household.tursoDbName;
		console.log(
			`[seed-household] ensuring deterministic Household database ${seedDbName}`,
		);
		const seedDatabaseCreated = await ensureSeedHouseholdDatabase(
			seedDbName,
			config,
		);
		if (seedDatabaseCreated) {
			await migrateHouseholdDb(seedDbName, config);
		}
		await resetHouseholdDatabaseByName(seedDbName, config);
		console.log(`[households] ${seedDbName} reset`);
	}
	await seedLocalDatabasesForMode(seedMode);
}

if (require.main === module) {
	reseedLocalDatabases().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

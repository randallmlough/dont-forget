import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertLocalDirectoryDatabaseUrl, readPostgresConfig } from "@/shared/env";
import { directoryClient, directoryDb } from "@/server/db/client";
import { resetDirectoryDatabase } from "@/server/db/reset";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/server/db/utils";
import {
	assertLocalSeedPrerequisites,
	readLocalSeedMode,
	seedLocalDatabasesForMode,
} from "./seed";

const DIRECTORY_MIGRATIONS = "./src/server/db/migrations/postgres";

export async function reseedLocalDatabases(): Promise<void> {
	const seedMode = readLocalSeedMode();
	assertLocalSeedPrerequisites({ seedMode });
	assertLocalDirectoryDatabaseUrl(readPostgresConfig());
	const directoryClientInstance = directoryClient();

	try {
		const directory = directoryDb(directoryClientInstance);
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

	await seedLocalDatabasesForMode(seedMode);
}

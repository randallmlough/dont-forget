import { migrate } from "drizzle-orm/node-postgres/migrator";

import { directoryClient, directoryDb } from "@/db/server/client";
import { resetDirectoryDatabase } from "@/db/server/reset";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import { assertLocalDirectoryDatabaseUrl, readPostgresConfig } from "@/lib/env";
import {
	assertLocalSeedPrerequisites,
	readLocalSeedMode,
	seedLocalDatabasesForMode,
} from "./seed";

const DIRECTORY_MIGRATIONS = "./src/db/migrations/postgres";

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

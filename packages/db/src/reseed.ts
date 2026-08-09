import {
	assertLocalDirectoryDatabaseUrl,
	readPostgresConfig,
} from "@dont-forget/shared/node";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { directoryDb, postgresPool } from "./client";
import { resetDirectoryDatabase } from "./reset";
import {
	assertLocalSeedPrerequisites,
	readLocalSeedMode,
	seedLocalDatabasesForMode,
} from "./seed";
import { DRIZZLE_MIGRATIONS_TABLE } from "./utils";

const DIRECTORY_MIGRATIONS = "./src/migrations/postgres";

export async function reseedLocalDatabases(): Promise<void> {
	const seedMode = readLocalSeedMode();
	assertLocalSeedPrerequisites({ seedMode });
	assertLocalDirectoryDatabaseUrl(readPostgresConfig());
	const pool = postgresPool();

	try {
		const directory = directoryDb(pool);
		console.log("[directory] resetting app data");
		await resetDirectoryDatabase(directory);
		console.log("[directory] migrating");
		await migrate(directory, {
			migrationsFolder: DIRECTORY_MIGRATIONS,
			migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
		});
	} finally {
		await pool.end();
	}

	await seedLocalDatabasesForMode(seedMode);
}

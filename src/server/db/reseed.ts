import { migrate } from "drizzle-orm/node-postgres/migrator";
import { directoryDb, postgresPool } from "@/server/db/client";
import { resetDirectoryDatabase } from "@/server/db/reset";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/server/db/utils";
import {
	assertLocalDirectoryDatabaseUrl,
	readPostgresConfig,
} from "@/shared/env";
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

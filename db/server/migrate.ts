import { isNull } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { households } from "@/db/schema/directory";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import {
	assertProductionConfirmation,
	readPostgresConfig,
	readTursoMigrationConfig,
} from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import { type DirectoryDb, directoryClient, directoryDb } from "./client";
import { migrateHouseholdDb } from "./household-migrations";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";

async function main(): Promise<void> {
	const productionConfirmation = process.env.CONFIRM_APP_ENV;
	const appEnv = loadEnvFile();
	assertProductionConfirmation(appEnv, {
		CONFIRM_APP_ENV: productionConfirmation,
	});
	const postgresConfig = readPostgresConfig();
	const tursoConfig = readTursoMigrationConfig();

	console.log(`[env] ${postgresConfig.appEnv}`);
	console.log("[directory] PostgreSQL");

	const directoryPool = directoryClient();
	try {
		const directory = directoryDb(directoryPool);
		console.log("[directory] migrating…");
		await migrate(directory, {
			migrationsFolder: DIRECTORY_MIGRATIONS,
			migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
		});
		console.log("[directory] done");

		await migrateAllHouseholds(directory, tursoConfig);
	} finally {
		await directoryPool.end();
	}
}

async function migrateAllHouseholds(
	directory: DirectoryDb,
	config: ReturnType<typeof readTursoMigrationConfig>,
): Promise<void> {
	const rows = await directory
		.select({ id: households.id, tursoDbName: households.tursoDbName })
		.from(households)
		.where(isNull(households.deletedAt));

	console.log(`[households] ${rows.length} active database(s) to migrate`);
	const failures: { id: string; error: unknown }[] = [];

	for (const row of rows) {
		try {
			await migrateHouseholdDb(row.tursoDbName, config);
		} catch (error) {
			failures.push({ id: row.id, error });
			console.error(
				`[households] ${row.id} (${row.tursoDbName}) failed:`,
				error,
			);
		}
	}

	if (failures.length > 0) {
		throw new Error(`Migration failed for ${failures.length} household DB(s)`);
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

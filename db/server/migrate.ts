import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { households } from "@/db/schema/directory";
import {
	assertProductionConfirmation,
	readTursoMigrationConfig,
} from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import { directoryClient } from "./client";
import { migrateHouseholdDb } from "./household-migrations";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";

async function main(): Promise<void> {
	const productionConfirmation = process.env.CONFIRM_APP_ENV;
	const appEnv = loadEnvFile();
	assertProductionConfirmation(appEnv, {
		CONFIRM_APP_ENV: productionConfirmation,
	});
	const config = readTursoMigrationConfig();

	console.log(`[env] ${config.appEnv}`);
	console.log(`[directory] ${config.directoryUrl}`);

	const directory = directoryClient();
	try {
		console.log("[directory] migrating…");
		await migrate(drizzle(directory), {
			migrationsFolder: DIRECTORY_MIGRATIONS,
		});
		console.log("[directory] done");

		await migrateAllHouseholds(directory, config);
	} finally {
		await directory.close();
	}
}

async function migrateAllHouseholds(
	directory: ReturnType<typeof directoryClient>,
	config: ReturnType<typeof readTursoMigrationConfig>,
): Promise<void> {
	const rows = await drizzle(directory)
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

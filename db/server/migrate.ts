import { migrate } from "drizzle-orm/node-postgres/migrator";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import {
	assertLocalDirectoryDatabaseUrl,
	assertProductionConfirmation,
	readPostgresConfig,
} from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import { directoryClient, directoryDb } from "./client";

const DIRECTORY_MIGRATIONS = "./db/migrations/postgres";

async function main(): Promise<void> {
	const productionConfirmation = process.env.CONFIRM_APP_ENV;
	const appEnv = loadEnvFile();
	assertProductionConfirmation(appEnv, {
		CONFIRM_APP_ENV: productionConfirmation,
	});
	const postgresConfig = readPostgresConfig();
	assertLocalDirectoryDatabaseUrl(postgresConfig);

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
	} finally {
		await directoryPool.end();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

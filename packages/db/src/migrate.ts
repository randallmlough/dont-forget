import path from "node:path";
import {
	assertLocalDirectoryDatabaseUrl,
	assertProductionConfirmation,
	loadEnvFile,
	readPostgresConfig,
} from "@dont-forget/shared/node";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { directoryDb, postgresPool } from "./client";
import { REPOSITORY_ROOT } from "./repository-root";
import { DRIZZLE_MIGRATIONS_TABLE } from "./utils";

const DIRECTORY_MIGRATIONS = "./src/migrations/postgres";

async function main(): Promise<void> {
	const productionConfirmation = process.env.CONFIRM_APP_ENV;
	const appEnv = loadEnvFile({ cwd: REPOSITORY_ROOT });
	assertProductionConfirmation(appEnv, {
		CONFIRM_APP_ENV: productionConfirmation,
	});
	const postgresConfig = readPostgresConfig();
	assertLocalDirectoryDatabaseUrl(postgresConfig);

	console.log(`[env] ${postgresConfig.appEnv}`);
	console.log("[directory] PostgreSQL");

	const pool = postgresPool();
	try {
		const directory = directoryDb(pool);
		console.log("[directory] migrating…");
		await migrate(directory, {
			migrationsFolder: DIRECTORY_MIGRATIONS,
			migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
		});
		console.log("[directory] done");
	} finally {
		await pool.end();
	}
}

// pnpm runs this package entrypoint with packages/db as the working directory.
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve("src/migrate.ts")
) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

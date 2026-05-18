import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { readTursoMigrationConfig, type TursoMigrationConfig } from "@/lib/env";
import { householdClient, householdDbUrl } from "./client";

const HOUSEHOLD_MIGRATIONS = "./db/migrations/household";

export async function migrateHouseholdDb(
	tursoDbName: string,
	config: TursoMigrationConfig = readTursoMigrationConfig(),
): Promise<void> {
	const client = householdClient(
		householdDbUrl(tursoDbName, config.org),
		config.platformGroupToken,
	);
	try {
		await migrate(drizzle(client), { migrationsFolder: HOUSEHOLD_MIGRATIONS });
	} finally {
		await client.close();
	}
}

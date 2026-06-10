import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import {
	directoryClient,
	directoryDb,
	householdClient,
	householdDb,
	householdDbUrl,
} from "@/db/client";
import { PRIMARY_HOUSEHOLD_SEED } from "@/db/fixtures";
import { migrateHouseholdDb } from "@/db/household-migrations";
import {
	assertDatabaseResetConfirmation,
	householdDatabasesForReset,
	resetDirectoryDatabase,
	resetHouseholdDatabase,
} from "@/db/reset";
import { readTursoOperatorConfig } from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import { assertLocalSeedEnvironment, seedLocalDatabases } from "./seed";
import { seedHouseholdDbNameForDirectory } from "./worktree-db";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";

export async function reseedLocalDatabases(): Promise<void> {
	const appEnv = loadEnvFile();
	assertLocalSeedEnvironment(appEnv);
	assertDatabaseResetConfirmation(appEnv, process.env);
	const config = readTursoOperatorConfig();
	const directoryClientInstance = directoryClient();

	try {
		const directory = directoryDb(directoryClientInstance);
		const householdDatabases = await householdDatabasesForReset(directory);
		for (const householdDatabase of householdDatabases) {
			await resetRemoteHouseholdDatabase(householdDatabase.tursoDbName, config);
		}

		console.log("[directory] resetting app data");
		await resetDirectoryDatabase(directory);
		console.log("[directory] migrating");
		await migrate(drizzle(directoryClientInstance), {
			migrationsFolder: DIRECTORY_MIGRATIONS,
		});
	} finally {
		await directoryClientInstance.close();
	}

	const seedDbName =
		seedHouseholdDbNameForDirectory(config.directoryUrl, config.org) ??
		PRIMARY_HOUSEHOLD_SEED.household.tursoDbName;
	console.log(
		`[seed-household] ensuring deterministic Household database ${seedDbName}`,
	);
	await ensureSeedHouseholdDatabase(seedDbName, config);
	await migrateHouseholdDb(seedDbName, config);
	await resetRemoteHouseholdDatabase(seedDbName, config);
	await seedLocalDatabases();
}

type ReseedTursoConfig = ReturnType<typeof readTursoOperatorConfig>;

async function ensureSeedHouseholdDatabase(
	tursoDbName: string,
	config: ReseedTursoConfig,
): Promise<void> {
	const response = await fetch(
		`https://api.turso.tech/v1/organizations/${config.org}/databases`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.platformApiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: tursoDbName,
				group: config.group,
			}),
		},
	);

	if (response.ok || response.status === 409) return;

	const details = await response.text().catch(() => "");
	throw new Error(
		[
			`Unable to ensure seed Household database (${response.status})`,
			details ? details.slice(0, 500) : null,
		]
			.filter(Boolean)
			.join(": "),
	);
}

async function resetRemoteHouseholdDatabase(
	tursoDbName: string,
	config: ReseedTursoConfig,
): Promise<void> {
	const client = householdClient(
		householdDbUrl(tursoDbName, config.org),
		config.platformGroupToken,
	);
	try {
		await resetHouseholdDatabase(householdDb(client));
		console.log(`[households] ${tursoDbName} reset`);
	} finally {
		await client.close();
	}
}

if (require.main === module) {
	reseedLocalDatabases().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

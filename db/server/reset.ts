import { asc } from "drizzle-orm";
import { itemChecks, items, lists } from "@/db/schema/household";
import {
	householdJoinCodes,
	householdJoinCodeUses,
	households,
	invitations,
	memberships,
	itemChecks as pgItemChecks,
	items as pgItems,
	lists as pgLists,
	users,
} from "@/db/schema/postgres";
import {
	type AppEnv,
	assertProductionConfirmation,
	readTursoMigrationConfig,
} from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import {
	type DirectoryDb,
	directoryClient,
	directoryDb,
	type HouseholdDb,
	householdClient,
	householdDb,
	householdDbUrl,
} from "./client";

type ResetConfirmationSource = Record<string, string | undefined>;

export type HouseholdDatabaseForReset = {
	id: string;
	tursoDbName: string;
};

export async function householdDatabasesForReset(
	directory: DirectoryDb,
): Promise<HouseholdDatabaseForReset[]> {
	return directory
		.select({ id: households.id, tursoDbName: households.tursoDbName })
		.from(households)
		.orderBy(asc(households.createdAt), asc(households.id));
}

export async function resetDirectoryDatabase(
	directory: DirectoryDb,
): Promise<void> {
	await directory.transaction(async (tx) => {
		await tx.delete(pgItemChecks);
		await tx.delete(pgItems);
		await tx.delete(pgLists);
		await tx.delete(householdJoinCodeUses);
		await tx.delete(householdJoinCodes);
		await tx.delete(invitations);
		await tx.delete(memberships);
		await tx.update(users).set({ activeHouseholdId: null });
		await tx.delete(households);
		await tx.delete(users);
	});
}

export async function resetHouseholdDatabase(
	household: HouseholdDb,
): Promise<void> {
	await household.transaction(async (tx) => {
		await tx.delete(itemChecks);
		await tx.delete(items);
		await tx.delete(lists);
	});
}

export function assertDatabaseResetConfirmation(
	appEnv: AppEnv,
	source: ResetConfirmationSource = process.env,
): void {
	if (source.CONFIRM_DB_RESET === appEnv) {
		return;
	}

	throw new Error(
		`Refusing database reset without CONFIRM_DB_RESET=${appEnv}. ` +
			`Re-run with APP_ENV=${appEnv} CONFIRM_DB_RESET=${appEnv} if this is intentional.`,
	);
}

async function main(): Promise<void> {
	const productionConfirmation = process.env.CONFIRM_APP_ENV;
	const resetConfirmation = process.env.CONFIRM_DB_RESET;
	const appEnv = loadEnvFile();
	assertProductionConfirmation(appEnv, {
		CONFIRM_APP_ENV: productionConfirmation,
	});
	assertDatabaseResetConfirmation(appEnv, {
		CONFIRM_DB_RESET: resetConfirmation,
	});
	const config = readTursoMigrationConfig();

	console.log(`[env] ${config.appEnv}`);
	console.log(`[directory] ${config.directoryUrl}`);

	const directoryClientInstance = directoryClient();
	try {
		const directory = directoryDb(directoryClientInstance);
		const householdDatabases = await householdDatabasesForReset(directory);
		await resetHouseholdDatabases(householdDatabases, config);

		console.log("[directory] resetting app data");
		await resetDirectoryDatabase(directory);
		console.log("[directory] done");
	} finally {
		await directoryClientInstance.end();
	}
}

async function resetHouseholdDatabases(
	householdDatabases: HouseholdDatabaseForReset[],
	config: ReturnType<typeof readTursoMigrationConfig>,
): Promise<void> {
	console.log(`[households] ${householdDatabases.length} database(s) to reset`);
	const failures: { id: string; error: unknown }[] = [];

	for (const householdDatabase of householdDatabases) {
		try {
			await resetHouseholdDatabaseByName(householdDatabase.tursoDbName, config);
			console.log(
				`[households] ${householdDatabase.id} (${householdDatabase.tursoDbName}) done`,
			);
		} catch (error) {
			failures.push({ id: householdDatabase.id, error });
			console.error(
				`[households] ${householdDatabase.id} (${householdDatabase.tursoDbName}) failed:`,
				error,
			);
		}
	}

	if (failures.length > 0) {
		throw new Error(
			`Database reset failed for ${failures.length} Household DB(s)`,
		);
	}
}

export async function resetHouseholdDatabaseByName(
	tursoDbName: string,
	config: ReturnType<typeof readTursoMigrationConfig>,
): Promise<void> {
	const client = householdClient(
		householdDbUrl(tursoDbName, config.org),
		config.platformGroupToken,
	);
	try {
		await resetHouseholdDatabase(householdDb(client));
	} finally {
		await client.close();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

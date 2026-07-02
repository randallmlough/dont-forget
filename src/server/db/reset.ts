import {
	type AppEnv,
	assertLocalDirectoryDatabaseUrl,
	assertProductionConfirmation,
	readPostgresConfig,
} from "@/shared/env";
import { loadEnvFile } from "@/shared/load-env";
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
} from "@/server/db/schema/postgres";
import { type DirectoryDb, directoryClient, directoryDb } from "./client";

type ResetConfirmationSource = Record<string, string | undefined>;

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

function postgresTarget(databaseUrl: string): string {
	try {
		const parsed = new URL(databaseUrl);
		return `${parsed.host}${parsed.pathname}`;
	} catch {
		return "<invalid DATABASE_URL>";
	}
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
	const postgresConfig = readPostgresConfig();
	assertLocalDirectoryDatabaseUrl(postgresConfig);

	console.log(`[env] ${postgresConfig.appEnv}`);
	console.log(`[directory] ${postgresTarget(postgresConfig.databaseUrl)}`);

	const directoryClientInstance = directoryClient();
	try {
		const directory = directoryDb(directoryClientInstance);
		console.log("[directory] resetting app data");
		await resetDirectoryDatabase(directory);
		console.log("[directory] done");
	} finally {
		await directoryClientInstance.end();
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

/**
 * Tear down this worktree's isolated directory DB: deletes every Household DB
 * recorded in it, deletes the directory DB itself, and restores the
 * `.env.local` values that `make worktree-db` replaced.
 *
 * Refuses to run unless TURSO_DIRECTORY_URL points at a `df-local-wt-*`
 * database, so it can never delete the shared local environment.
 *
 * Run with: make worktree-db-destroy
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client/http";
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { households } from "@/db/schema/directory";
import { readTursoOperatorConfig } from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import { tursoPlatformApi } from "./turso-platform-api";
import {
	directoryDbNameFromUrl,
	ENV_FILE,
	ORIGINAL_PREFIX,
	WORKTREE_DB_PREFIX,
} from "./worktree-db";

async function main(): Promise<void> {
	const appEnv = loadEnvFile();
	if (appEnv !== "local") {
		throw new Error("worktree-db-destroy only supports APP_ENV=local");
	}
	const config = readTursoOperatorConfig();
	const dbName = directoryDbNameFromUrl(config.directoryUrl, config.org);
	if (!dbName.startsWith(WORKTREE_DB_PREFIX)) {
		throw new Error(
			`TURSO_DIRECTORY_URL points at ${dbName}, not a ${WORKTREE_DB_PREFIX}* database; refusing to delete a shared environment`,
		);
	}

	const platform = tursoPlatformApi(config);
	const client = createClient({
		url: config.directoryUrl,
		authToken: config.directoryAuthToken,
	});
	let householdDbNames: string[] = [];
	try {
		householdDbNames = (
			await drizzle(client)
				.select({ tursoDbName: households.tursoDbName })
				.from(households)
				.where(isNull(households.deletedAt))
		).map((row) => row.tursoDbName);
	} finally {
		client.close();
	}

	for (const householdDbName of householdDbNames) {
		console.log(`[worktree-db] deleting household DB ${householdDbName}`);
		await platform.deleteDatabase(householdDbName);
	}
	console.log(`[worktree-db] deleting directory DB ${dbName}`);
	await platform.deleteDatabase(dbName);

	restoreEnvValues(path.join(process.cwd(), ENV_FILE));
	console.log(`[worktree-db] restored ${ENV_FILE} to the shared environment`);
}

function restoreEnvValues(envPath: string): void {
	const lines = readFileSync(envPath, "utf8").split("\n");
	const restored: string[] = [];
	let skipNext = false;
	for (const line of lines) {
		if (line.startsWith(ORIGINAL_PREFIX)) {
			restored.push(line.slice(ORIGINAL_PREFIX.length));
			skipNext = true;
			continue;
		}
		if (skipNext) {
			skipNext = false;
			continue;
		}
		restored.push(line);
	}
	writeFileSync(envPath, restored.join("\n"));
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

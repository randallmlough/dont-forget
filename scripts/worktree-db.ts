/**
 * Point this worktree at its own directory DB so parallel efforts cannot
 * contaminate each other's Household schemas (divergent migrations applied to
 * shared DBs union or skip silently). Creates `df-local-wt-<worktree>-dir` in
 * the existing local Turso group, migrates it, and rewrites the worktree's
 * own `.env.local` (converted from symlink to copy when needed). Originals
 * are kept as comments so `make worktree-db-destroy` can restore them.
 *
 * Run with: make worktree-db
 */
import {
	chmodSync,
	copyFileSync,
	lstatSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client/http";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createTursoPlatformClient } from "@/db/server/turso-platform";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import { readTursoOperatorConfig } from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";
const TOKEN_EXPIRATION = "30d";

export const ENV_FILE = ".env.local";
export const WORKTREE_DB_PREFIX = "df-local-wt-";
export const ORIGINAL_PREFIX = "# worktree-db original ";

async function main(): Promise<void> {
	const appEnv = loadEnvFile();
	if (appEnv !== "local") {
		throw new Error("worktree-db only supports APP_ENV=local");
	}
	const config = readTursoOperatorConfig();
	const envPath = path.join(process.cwd(), ENV_FILE);
	const dbName = worktreeDirectoryDbName(process.cwd());

	if (config.directoryUrl.includes(`${dbName}-`)) {
		console.log(`[worktree-db] ${ENV_FILE} already points at ${dbName}`);
		return;
	}

	materializeEnvFile(envPath);

	console.log(`[worktree-db] creating ${dbName} in group ${config.group}`);
	const platform = createTursoPlatformClient(config);
	const database = await platform.ensureDatabase(dbName);
	const authToken = await platform.createDatabaseAuthToken(
		dbName,
		TOKEN_EXPIRATION,
	);

	console.log(`[worktree-db] migrating ${database.url}`);
	const client = createClient({ url: database.url, authToken });
	try {
		await migrate(drizzle(client), {
			migrationsFolder: DIRECTORY_MIGRATIONS,
			migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
		});
	} finally {
		client.close();
	}

	overrideEnvValues(envPath, {
		TURSO_DIRECTORY_URL: database.url,
		TURSO_DIRECTORY_AUTH_TOKEN: authToken,
	});
	console.log(
		`[worktree-db] ${ENV_FILE} now points at ${dbName} (token expires in ${TOKEN_EXPIRATION})`,
	);
	console.log(
		"[worktree-db] create fresh accounts in this worktree; Households provision into isolated DBs",
	);
}

export function worktreeDirectoryDbName(worktreePath: string): string {
	const slug = path
		.basename(worktreePath)
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!slug) {
		throw new Error("Could not derive a worktree slug for the directory DB");
	}
	// Turso database names are limited to 51 characters.
	const maxSlug = 51 - WORKTREE_DB_PREFIX.length - "-dir".length;
	return `${WORKTREE_DB_PREFIX}${slug.slice(0, maxSlug)}-dir`;
}

export function directoryDbNameFromUrl(url: string, org: string): string {
	const subdomain = url
		.replace(/^libsql:\/\//, "")
		.replace(/^https:\/\//, "")
		.split(".")[0];
	// Subdomain is <db-name>-<org>; hosts may also carry a region segment.
	return subdomain.endsWith(`-${org}`)
		? subdomain.slice(0, -(org.length + 1))
		: subdomain;
}

/**
 * The deterministic seed Household DB must be worktree-scoped alongside the
 * directory DB: a fixed shared name would let parallel worktrees apply
 * divergent Household migrations to one DB, and `worktree-db-destroy` would
 * delete the shared seed DB out from under other checkouts. Returns null when
 * the directory DB is not a worktree DB (shared environment keeps the fixture
 * default).
 */
export function seedHouseholdDbNameForDirectory(
	directoryUrl: string,
	org: string,
): string | null {
	const directoryDbName = directoryDbNameFromUrl(directoryUrl, org);
	if (
		!directoryDbName.startsWith(WORKTREE_DB_PREFIX) ||
		!directoryDbName.endsWith("-dir")
	) {
		return null;
	}
	const base = directoryDbName.slice(0, -"-dir".length);
	// Turso database names are limited to 51 characters.
	return `${base.slice(0, 51 - "-hh-seed".length)}-hh-seed`;
}

function materializeEnvFile(envPath: string): void {
	const stats = lstatSync(envPath, { throwIfNoEntry: false });
	if (!stats) {
		throw new Error(`${ENV_FILE} not found; run \`make worktree-env\` first`);
	}
	if (!stats.isSymbolicLink()) return;

	const source = realpathSync(envPath);
	rmSync(envPath);
	copyFileSync(source, envPath);
	chmodSync(envPath, 0o600);
	console.log(
		`[worktree-db] converted ${ENV_FILE} symlink into a copy of ${source}`,
	);
}

function overrideEnvValues(
	envPath: string,
	overrides: Record<string, string>,
): void {
	const lines = readFileSync(envPath, "utf8").split("\n");
	const replaced = new Set<string>();
	const next = lines.flatMap((line) => {
		for (const [key, value] of Object.entries(overrides)) {
			if (line.startsWith(`${key}=`)) {
				replaced.add(key);
				return [`${ORIGINAL_PREFIX}${line}`, `${key}=${value}`];
			}
		}
		return [line];
	});
	const missing = Object.keys(overrides).filter((key) => !replaced.has(key));
	if (missing.length > 0) {
		throw new Error(
			`${ENV_FILE} has no ${missing.join(", ")} line(s) to rewrite; this worktree would keep using the shared directory DB`,
		);
	}
	writeFileSync(envPath, next.join("\n"));
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

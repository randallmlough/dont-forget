/**
 * Directory DB worktree isolation is deferred while the live directory uses
 * Postgres. The naming helpers remain for deterministic Household seed DBs.
 *
 * Run with: make worktree-db
 */
import { loadEnvFile } from "@/lib/load-env";

export const WORKTREE_DB_PREFIX = "df-local-wt-";

async function main(): Promise<void> {
	const appEnv = loadEnvFile();
	if (appEnv !== "local") {
		throw new Error("worktree-db only supports APP_ENV=local");
	}
	throw new Error(
		"worktree directory isolation is not supported on Postgres yet (see PR-E).",
	);
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

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

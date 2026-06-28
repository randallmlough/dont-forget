/**
 * Directory DB worktree isolation cleanup is deferred while the live directory
 * uses Postgres.
 *
 * Run with: make worktree-db-destroy
 */
import { loadEnvFile } from "@/lib/load-env";

async function main(): Promise<void> {
	const appEnv = loadEnvFile();
	if (appEnv !== "local") {
		throw new Error("worktree-db-destroy only supports APP_ENV=local");
	}
	throw new Error(
		"worktree directory isolation cleanup is not supported on Postgres yet (see PR-E).",
	);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

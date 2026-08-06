/**
 * Directory DB worktree isolation cleanup is deferred while the live directory
 * uses Postgres.
 *
 * Run with: make worktree-db-destroy
 */
import { loadEnvFile } from "@dont-forget/shared/node";
import { REPOSITORY_ROOT } from "../src/repository-root";

async function main(): Promise<void> {
	const appEnv = loadEnvFile({ cwd: REPOSITORY_ROOT });
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

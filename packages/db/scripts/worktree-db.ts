/**
 * Directory DB worktree isolation is deferred while the live directory uses
 * Postgres.
 *
 * Run with: make worktree-db
 */
import path from "node:path";
import { loadEnvFile } from "@dont-forget/shared/node";
import { REPOSITORY_ROOT } from "../src/repository-root";

async function main(): Promise<void> {
	const appEnv = loadEnvFile({ cwd: REPOSITORY_ROOT });
	if (appEnv !== "local") {
		throw new Error("worktree-db only supports APP_ENV=local");
	}
	throw new Error(
		"worktree directory isolation is not supported on Postgres yet (see PR-E).",
	);
}

// pnpm runs this package entrypoint with packages/db as the working directory.
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve("scripts/worktree-db.ts")
) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

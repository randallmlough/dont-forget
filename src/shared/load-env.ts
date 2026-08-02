import path from "node:path";
import { config as loadDotenv } from "dotenv";

import { type AppEnv, parseAppEnv } from "./env.ts";

type LoadEnvFileOptions = {
	cwd?: string;
	requireAppEnv?: boolean;
};

export function loadEnvFile(options?: {
	cwd?: string;
	requireAppEnv?: true;
}): AppEnv;
export function loadEnvFile(options: {
	cwd?: string;
	requireAppEnv: false;
}): AppEnv | undefined;
export function loadEnvFile(
	options: LoadEnvFileOptions = {},
): AppEnv | undefined {
	const { cwd = process.cwd(), requireAppEnv = true } = options;
	const value = process.env.APP_ENV;

	if (!value) {
		if (requireAppEnv) {
			throw new Error("Missing required env var: APP_ENV");
		}
		return undefined;
	}

	const appEnv = parseAppEnv(value);
	const dotenvPaths =
		appEnv === "local"
			? [path.join(cwd, ".env.worktree"), path.join(cwd, ".env.local")]
			: [path.join(cwd, `.env.${appEnv}`)];
	loadDotenv({ path: dotenvPaths, quiet: true });
	return appEnv;
}

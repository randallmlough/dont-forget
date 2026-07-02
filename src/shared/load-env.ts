import path from "node:path";
import { config as loadDotenv } from "dotenv";

import { type AppEnv, parseAppEnv } from "./env.ts";

type LoadEnvFileOptions = {
	requireAppEnv?: boolean;
};

export function loadEnvFile(options?: { requireAppEnv?: true }): AppEnv;
export function loadEnvFile(options: {
	requireAppEnv: false;
}): AppEnv | undefined;
export function loadEnvFile(
	options: LoadEnvFileOptions = {},
): AppEnv | undefined {
	const { requireAppEnv = true } = options;
	const value = process.env.APP_ENV;

	if (!value) {
		if (requireAppEnv) {
			throw new Error("Missing required env var: APP_ENV");
		}
		return undefined;
	}

	const appEnv = parseAppEnv(value);
	loadDotenv({ path: path.join(process.cwd(), `.env.${appEnv}`), quiet: true });
	return appEnv;
}

import { defineConfig } from "drizzle-kit";
import { requireEnv } from "../../lib/env";
import { loadEnvFile } from "../../lib/load-env";

loadEnvFile({ requireAppEnv: false });

export default defineConfig({
	schema: "./db/schema/directory.ts",
	out: "./db/migrations/directory",
	dialect: "turso",
	dbCredentials: {
		url: requireEnv("TURSO_DIRECTORY_URL"),
		authToken: requireEnv("TURSO_DIRECTORY_AUTH_TOKEN"),
	},
});

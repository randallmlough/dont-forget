import { defineConfig } from "drizzle-kit";
import { requireEnv } from "../../lib/env";
import { loadEnvFile } from "../../lib/load-env";

loadEnvFile({ requireAppEnv: false });

export default defineConfig({
	schema: "./db/schema/directory.ts",
	out: "./db/migrations/directory",
	dialect: "postgresql",
	dbCredentials: {
		url: requireEnv("DATABASE_URL"),
	},
});

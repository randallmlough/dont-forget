import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "../../lib/load-env";

loadEnvFile({ requireAppEnv: false });

export default defineConfig({
  schema: "./db/schema/directory.ts",
  out: "./db/migrations/directory",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DIRECTORY_URL!,
    authToken: process.env.TURSO_DIRECTORY_AUTH_TOKEN!,
  },
});

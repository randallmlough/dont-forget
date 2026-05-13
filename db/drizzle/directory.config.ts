import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema/directory.ts",
  out: "./db/migrations/directory",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DIRECTORY_URL!,
    authToken: process.env.TURSO_DIRECTORY_AUTH_TOKEN!,
  },
});

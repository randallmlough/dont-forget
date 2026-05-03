import { defineConfig } from "drizzle-kit";

// Generates SQL for the per-Household DB schema. There is no single "household"
// database to point at — these migrations are applied at runtime by the migrate
// runner (db/migrate.ts), once per Household DB plus once per fresh DB at
// provisioning time. drizzle-kit only emits SQL files for this config.
export default defineConfig({
  schema: "./db/schema/household.ts",
  out: "./db/migrations/household",
  dialect: "turso",
});

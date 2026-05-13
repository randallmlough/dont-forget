import { defineConfig } from "drizzle-kit";

// SQL-only config: no DB to point at — migrations are applied per Household DB
// at runtime by db/migrate.ts (see ADR-0003).
export default defineConfig({
  schema: "./db/schema/household.ts",
  out: "./db/migrations/household",
  dialect: "turso",
});

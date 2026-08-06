import { defineConfig } from "drizzle-kit";

// Connectionless config: schema + out + dialect only. db/server/generate.ts
// evaluates this at module load with no DATABASE_URL guaranteed, and
// `drizzle-kit generate` for postgresql never connects — so no dbCredentials.
export default defineConfig({
	schema: "./src/schema/postgres/index.ts",
	out: "./src/migrations/postgres",
	dialect: "postgresql",
});

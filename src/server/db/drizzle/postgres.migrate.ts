import { defineConfig } from "drizzle-kit";
import { requireEnv } from "@/shared/env";
import { loadEnvFile } from "@/shared/load-env";
import base from "./postgres.config";

// Connection-bearing variant of postgres.config.ts, used ONLY by
// `drizzle-kit migrate` (make pg-migrate). The base config is intentionally
// connectionless because db/server/generate.ts evaluates it without a
// DATABASE_URL; `migrate` must connect, so this loads the env file and supplies
// DATABASE_URL (the source Postgres from the host). Schema/out are reused from
// the base so generate and migrate never drift. The `.config.ts` suffix is
// deliberately dropped (this is postgres.migrate.ts, not .config.ts) so
// generate.ts's `*.config.ts` glob skips it — `make db-generate` must never
// load this connection-bearing config and trip requireEnv("DATABASE_URL").
loadEnvFile({ requireAppEnv: false });

export default defineConfig({
	schema: base.schema,
	out: base.out,
	dialect: "postgresql",
	dbCredentials: {
		url: requireEnv("DATABASE_URL"),
	},
});

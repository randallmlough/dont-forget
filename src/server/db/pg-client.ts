import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema/postgres";
import { readPostgresConfig } from "@/shared/env";

export type PostgresDb = ReturnType<typeof postgresDb>;

export function postgresPool(): Pool {
	const { databaseUrl } = readPostgresConfig();
	return new Pool({ connectionString: databaseUrl });
}

export function postgresDb(pool: Pool) {
	return drizzle(pool, { schema });
}

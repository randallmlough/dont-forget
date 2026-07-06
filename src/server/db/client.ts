import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/server/db/schema/postgres";
import { readPostgresConfig } from "@/shared/env";

export type DirectoryDb = ReturnType<typeof directoryDb>;

// One Postgres holds everything (ADR-0018): this is the single way server-side
// code reaches it. Callers own the pool lifecycle — construct one per
// request/script and end() it in a finally.
export function postgresPool(): Pool {
	const { databaseUrl } = readPostgresConfig();
	return new Pool({ connectionString: databaseUrl });
}

export function directoryDb(pool: Pool) {
	return drizzle(pool, { schema });
}

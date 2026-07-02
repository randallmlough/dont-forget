import { drizzle as nodePgDrizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as directorySchema from "@/server/db/schema/postgres";
import { postgresPool } from "./pg-client";

export type DirectoryDb = ReturnType<typeof directoryDb>;

export function directoryClient(): Pool {
	return postgresPool();
}

export function directoryDb(pool: Pool) {
	return nodePgDrizzle(pool, { schema: directorySchema });
}

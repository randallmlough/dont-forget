import { type Client, createClient } from "@libsql/client/http";
import { drizzle as libsqlDrizzle } from "drizzle-orm/libsql";
import { drizzle as nodePgDrizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as directorySchema from "@/db/schema/directory";
import * as householdSchema from "@/db/schema/household";
import { readTursoConfig } from "@/lib/env";
import { postgresPool } from "./pg-client";

export type DirectoryDb = ReturnType<typeof directoryDb>;
export type HouseholdDb = ReturnType<typeof householdDb>;

export function directoryClient(): Pool {
	return postgresPool();
}

export function directoryDb(pool: Pool) {
	return nodePgDrizzle(pool, { schema: directorySchema });
}

export function householdDbUrl(
	tursoDbName: string,
	org = readTursoConfig().org,
): string {
	return `libsql://${tursoDbName}-${org}.turso.io`;
}

export function householdClient(url: string, authToken: string): Client {
	return createClient({ url, authToken });
}

export function householdDb(client: Client) {
	return libsqlDrizzle(client, { schema: householdSchema });
}

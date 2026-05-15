import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { readTursoMigrationConfig } from "@/lib/env";
import { householdClient, householdDbUrl } from "./client";

const HOUSEHOLD_MIGRATIONS = "./db/migrations/household";

export async function migrateHouseholdDb(tursoDbName: string): Promise<void> {
  const config = readTursoMigrationConfig();
  const client = householdClient(householdDbUrl(tursoDbName), config.platformGroupToken);
  try {
    await migrate(drizzle(client), { migrationsFolder: HOUSEHOLD_MIGRATIONS });
  } finally {
    await client.close();
  }
}

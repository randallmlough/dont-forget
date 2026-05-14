import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { isNull } from "drizzle-orm";
import { assertProductionConfirmation, readTursoMigrationConfig } from "@/lib/env";
import { loadEnvFile } from "@/lib/load-env";
import { directoryClient, householdClient, householdDbUrl } from "./client";
import { households } from "./schema/directory";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";
const HOUSEHOLD_MIGRATIONS = "./db/migrations/household";

async function main(): Promise<void> {
  const productionConfirmation = process.env.CONFIRM_APP_ENV;
  const appEnv = loadEnvFile();
  assertProductionConfirmation(appEnv, { CONFIRM_APP_ENV: productionConfirmation });
  const config = readTursoMigrationConfig();

  console.log(`[env] ${config.appEnv}`);
  console.log(`[directory] ${config.directoryUrl}`);

  const directory = directoryClient();
  try {
    console.log("[directory] migrating…");
    await migrate(drizzle(directory), { migrationsFolder: DIRECTORY_MIGRATIONS });
    console.log("[directory] done");

    await migrateAllHouseholds(directory);
  } finally {
    await directory.close();
  }
}

async function migrateAllHouseholds(directory: ReturnType<typeof directoryClient>): Promise<void> {
  const rows = await drizzle(directory)
    .select({ id: households.id, tursoDbName: households.tursoDbName })
    .from(households)
    .where(isNull(households.deletedAt));

  console.log(`[households] ${rows.length} active database(s) to migrate`);
  const failures: { id: string; error: unknown }[] = [];

  for (const row of rows) {
    try {
      await migrateHouseholdDb(row.tursoDbName);
    } catch (error) {
      failures.push({ id: row.id, error });
      console.error(`[households] ${row.id} (${row.tursoDbName}) failed:`, error);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Migration failed for ${failures.length} household DB(s)`);
  }
}

export async function migrateHouseholdDb(tursoDbName: string): Promise<void> {
  const config = readTursoMigrationConfig();
  const client = householdClient(
    householdDbUrl(tursoDbName),
    config.platformGroupToken,
  );
  try {
    await migrate(drizzle(client), { migrationsFolder: HOUSEHOLD_MIGRATIONS });
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

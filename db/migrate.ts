import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { isNull } from "drizzle-orm";
import { requireEnv } from "@/lib/env";
import { directoryClient, householdClient, householdDbUrl } from "./client";
import { households } from "./schema/directory";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";
const HOUSEHOLD_MIGRATIONS = "./db/migrations/household";

async function main(): Promise<void> {
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
  const client = householdClient(
    householdDbUrl(tursoDbName),
    requireEnv("TURSO_PLATFORM_GROUP_TOKEN"),
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

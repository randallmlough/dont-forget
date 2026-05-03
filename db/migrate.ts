import "dotenv/config";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { isNull } from "drizzle-orm";
import { households } from "./schema/directory";

const DIRECTORY_MIGRATIONS = "./db/migrations/directory";
const HOUSEHOLD_MIGRATIONS = "./db/migrations/household";

async function migrateDirectory(): Promise<void> {
  const client = createClient({
    url: requireEnv("TURSO_DIRECTORY_URL"),
    authToken: requireEnv("TURSO_DIRECTORY_AUTH_TOKEN"),
  });
  const db = drizzle(client);
  console.log("[directory] migrating…");
  await migrate(db, { migrationsFolder: DIRECTORY_MIGRATIONS });
  console.log("[directory] done");
  client.close();
}

async function migrateAllHouseholds(): Promise<void> {
  const directory = drizzle(
    createClient({
      url: requireEnv("TURSO_DIRECTORY_URL"),
      authToken: requireEnv("TURSO_DIRECTORY_AUTH_TOKEN"),
    }),
  );

  const rows = await directory
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
  const url = householdDbUrl(tursoDbName);
  const client = createClient({
    url,
    authToken: requireEnv("TURSO_PLATFORM_GROUP_TOKEN"),
  });
  await runHouseholdMigrations(client);
  client.close();
}

async function runHouseholdMigrations(client: Client): Promise<void> {
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: HOUSEHOLD_MIGRATIONS });
}

function householdDbUrl(tursoDbName: string): string {
  const org = requireEnv("TURSO_ORG");
  return `libsql://${tursoDbName}-${org}.turso.io`;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

async function main(): Promise<void> {
  await migrateDirectory();
  await migrateAllHouseholds();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

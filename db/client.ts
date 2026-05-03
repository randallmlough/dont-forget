import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as directorySchema from "./schema/directory";
import * as householdSchema from "./schema/household";

export type DirectoryDb = ReturnType<typeof directoryDb>;
export type HouseholdDb = ReturnType<typeof householdDb>;

export function directoryDb(client: Client = directoryClient()) {
  return drizzle(client, { schema: directorySchema });
}

export function householdDb(url: string, authToken: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema: householdSchema });
}

export function directoryClient(): Client {
  const url = requireEnv("TURSO_DIRECTORY_URL");
  const authToken = requireEnv("TURSO_DIRECTORY_AUTH_TOKEN");
  return createClient({ url, authToken });
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

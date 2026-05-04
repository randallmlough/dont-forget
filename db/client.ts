import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { requireEnv } from "@/lib/env";
import * as directorySchema from "./schema/directory";
import * as householdSchema from "./schema/household";

export type DirectoryDb = ReturnType<typeof directoryDb>;
export type HouseholdDb = ReturnType<typeof householdDb>;

export function directoryClient(): Client {
  return createClient({
    url: requireEnv("TURSO_DIRECTORY_URL"),
    authToken: requireEnv("TURSO_DIRECTORY_AUTH_TOKEN"),
  });
}

export function directoryDb(client: Client) {
  return drizzle(client, { schema: directorySchema });
}

export function householdDbUrl(tursoDbName: string): string {
  return `libsql://${tursoDbName}-${requireEnv("TURSO_ORG")}.turso.io`;
}

export function householdClient(url: string, authToken: string): Client {
  return createClient({ url, authToken });
}

export function householdDb(client: Client) {
  return drizzle(client, { schema: householdSchema });
}

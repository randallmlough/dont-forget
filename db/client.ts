import { createClient, type Client } from "@libsql/client/http";
import { drizzle } from "drizzle-orm/libsql";
import { readTursoConfig } from "@/lib/env";
import * as directorySchema from "./schema/directory";
import * as householdSchema from "./schema/household";

export type DirectoryDb = ReturnType<typeof directoryDb>;
export type HouseholdDb = ReturnType<typeof householdDb>;

export function directoryClient(): Client {
  const config = readTursoConfig();
  return createClient({
    url: config.directoryUrl,
    authToken: config.directoryAuthToken,
  });
}

export function directoryDb(client: Client) {
  return drizzle(client, { schema: directorySchema });
}

export function householdDbUrl(tursoDbName: string, org = readTursoConfig().org): string {
  return `libsql://${tursoDbName}-${org}.turso.io`;
}

export function householdClient(url: string, authToken: string): Client {
  return createClient({ url, authToken });
}

export function householdDb(client: Client) {
  return drizzle(client, { schema: householdSchema });
}

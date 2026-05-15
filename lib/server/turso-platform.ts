import { readTursoOperatorConfig, type TursoOperatorConfig } from "@/lib/env";

type Fetch = typeof fetch;

type TursoDatabasePayload = {
  database?: Record<string, unknown>;
  [key: string]: unknown;
};

export type TursoDatabase = {
  name: string;
  url: string;
};

export class TursoPlatformError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TursoPlatformError";
  }
}

export type TursoPlatformClient = {
  ensureDatabase: (databaseName: string) => Promise<TursoDatabase>;
  getDatabase: (databaseName: string) => Promise<TursoDatabase>;
  createDatabaseAuthToken: (databaseName: string, expiration: string) => Promise<string>;
};

export function createTursoPlatformClient(
  config: TursoOperatorConfig = readTursoOperatorConfig(),
  fetchFn: Fetch = fetch,
): TursoPlatformClient {
  const baseUrl = `https://api.turso.tech/v1/organizations/${config.org}`;

  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.platformApiToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      throw new TursoPlatformError(
        `Turso Platform request failed with ${response.status}`,
        response.status,
      );
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function createDatabase(databaseName: string): Promise<void> {
    try {
      await request("/databases", {
        method: "POST",
        body: JSON.stringify({ name: databaseName, group: config.group }),
      });
    } catch (error) {
      if (error instanceof TursoPlatformError && error.status === 409) {
        return;
      }
      throw error;
    }
  }

  async function getDatabase(databaseName: string): Promise<TursoDatabase> {
    const payload = (await request(`/databases/${databaseName}`)) as TursoDatabasePayload;
    return normalizeDatabase(payload, databaseName, config.org);
  }

  return {
    async ensureDatabase(databaseName: string) {
      await createDatabase(databaseName);
      return getDatabase(databaseName);
    },
    getDatabase,
    async createDatabaseAuthToken(databaseName: string, expiration: string) {
      const payload = (await request(`/databases/${databaseName}/auth/tokens`, {
        method: "POST",
        body: JSON.stringify({ authorization: "full-access", expiration }),
      })) as Record<string, unknown>;
      const token = payload.jwt ?? payload.token ?? payload.authToken;
      if (typeof token !== "string" || token.length === 0) {
        throw new TursoPlatformError("Turso Platform token response did not include a token");
      }

      return token;
    },
  };
}

function normalizeDatabase(
  payload: TursoDatabasePayload,
  fallbackName: string,
  org: string,
): TursoDatabase {
  const database = (payload.database ?? payload) as Record<string, unknown>;
  const name = stringValue(database.name) ?? stringValue(database.Name) ?? fallbackName;
  const hostname = stringValue(database.hostname) ?? stringValue(database.Hostname);
  const url = stringValue(database.url) ?? stringValue(database.DbUrl) ?? urlFromHostname(hostname, name, org);

  return { name, url };
}

function urlFromHostname(hostname: string | null, databaseName: string, org: string): string {
  if (hostname) {
    return hostname.startsWith("libsql://") ? hostname : `libsql://${hostname}`;
  }

  return `libsql://${databaseName}-${org}.turso.io`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

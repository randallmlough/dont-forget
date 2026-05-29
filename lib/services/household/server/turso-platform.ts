import { z } from "zod";

import { readTursoOperatorConfig, type TursoOperatorConfig } from "@/lib/env";

type Fetch = typeof fetch;

export type TursoDatabase = {
	name: string;
	url: string;
};

export class TursoPlatformError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly details?: string,
	) {
		super(message);
		this.name = "TursoPlatformError";
	}
}

export type TursoPlatformClient = {
	ensureDatabase: (databaseName: string) => Promise<TursoDatabase>;
	getDatabase: (databaseName: string) => Promise<TursoDatabase>;
	createDatabaseAuthToken: (
		databaseName: string,
		expiration: string,
	) => Promise<string>;
};

const recordSchema = z.record(z.string(), z.unknown());

const tursoDatabasePayloadSchema = z
	.object({
		database: recordSchema.optional(),
	})
	.passthrough();

const tursoAuthTokenPayloadSchema = z
	.object({
		jwt: z.string().optional(),
		token: z.string().optional(),
		authToken: z.string().optional(),
	})
	.passthrough();

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
			const details = await response.text().catch(() => "");
			throw new TursoPlatformError(
				[
					`Turso Platform request failed with ${response.status}`,
					details ? details.slice(0, 500) : null,
				]
					.filter(Boolean)
					.join(": "),
				response.status,
				details || undefined,
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
		const payload = await request(`/databases/${databaseName}`);
		return normalizeDatabase(parseDatabasePayload(payload));
	}

	return {
		async ensureDatabase(databaseName: string) {
			await createDatabase(databaseName);
			return getDatabase(databaseName);
		},
		getDatabase,
		async createDatabaseAuthToken(databaseName: string, expiration: string) {
			const payload = await request(`/databases/${databaseName}/auth/tokens`, {
				method: "POST",
				body: JSON.stringify({ authorization: "full-access", expiration }),
			});
			const tokenPayload = parseAuthTokenPayload(payload);
			const token =
				tokenPayload.jwt ?? tokenPayload.token ?? tokenPayload.authToken;
			if (typeof token !== "string" || token.length === 0) {
				throw new TursoPlatformError(
					"Turso Platform token response did not include a token",
				);
			}

			return token;
		},
	};
}

function parseDatabasePayload(
	payload: unknown,
): z.infer<typeof tursoDatabasePayloadSchema> {
	const parsed = tursoDatabasePayloadSchema.safeParse(payload);
	if (!parsed.success) {
		throw new TursoPlatformError(
			"Turso Platform database response was malformed",
		);
	}

	return parsed.data;
}

function parseAuthTokenPayload(
	payload: unknown,
): z.infer<typeof tursoAuthTokenPayloadSchema> {
	const parsed = tursoAuthTokenPayloadSchema.safeParse(payload);
	if (!parsed.success) {
		throw new TursoPlatformError("Turso Platform token response was malformed");
	}

	return parsed.data;
}

function normalizeDatabase(
	payload: z.infer<typeof tursoDatabasePayloadSchema>,
): TursoDatabase {
	const database = payload.database ?? payload;
	const name = requiredString(database.Name ?? database.name, "database name");
	const hostname = requiredString(
		database.Hostname ?? database.hostname,
		"database hostname",
	);
	const url = hostname.startsWith("libsql://")
		? hostname
		: `libsql://${hostname}`;

	return { name, url };
}

function requiredString(value: unknown, label: string): string {
	if (typeof value === "string" && value.length > 0) {
		return value;
	}

	throw new TursoPlatformError(
		`Turso Platform database response did not include ${label}`,
	);
}

import {
	createTursoPlatformClient,
	type TursoPlatformError,
} from "@/db/server/turso-platform";
import type { TursoOperatorConfig } from "@/lib/env";

describe("createTursoPlatformClient", () => {
	it("creates or reuses a database and normalizes its URL", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(response(409, { error: "exists" }, false))
			.mockResolvedValueOnce(
				response(200, {
					database: { Name: "db-one", Hostname: "db-one-org.turso.io" },
				}),
			);

		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.ensureDatabase("db-one")).resolves.toEqual({
			name: "db-one",
			url: "libsql://db-one-org.turso.io",
		});
		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			"https://api.turso.tech/v1/organizations/acme/databases",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ name: "db-one", group: "dont-forget-test" }),
			}),
		);
	});

	it("mints database auth tokens", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(response(200, { jwt: "db-token" }));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.createDatabaseAuthToken("db-one", "24h")).resolves.toBe(
			"db-token",
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.turso.tech/v1/organizations/acme/databases/db-one/auth/tokens?authorization=full-access&expiration=24h",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("fails clearly when the token response is malformed", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(response(200, { jwt: 123 }));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(
			client.createDatabaseAuthToken("db-one", "24h"),
		).rejects.toThrow("Turso Platform token response was malformed");
	});

	it("includes platform error response details", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(
				response(400, { error: "group not found" }, false),
			);
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.ensureDatabase("db-one")).rejects.toMatchObject({
			name: "TursoPlatformError",
			status: 400,
			message:
				'Turso Platform request failed with 400: {"error":"group not found"}',
			details: '{"error":"group not found"}',
		} satisfies Partial<TursoPlatformError>);
	});

	it("fails clearly when the database response is malformed", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(
				response(201, {
					database: { Name: "db-one", Hostname: "db-one-org.turso.io" },
				}),
			)
			.mockResolvedValueOnce(response(200, { database: { Name: "db-one" } }));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.ensureDatabase("db-one")).rejects.toThrow(
			"Turso Platform database response did not include database hostname",
		);
	});

	it("rejects malformed database envelopes before normalization", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(response(200, { database: "db-one" }));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.getDatabase("db-one")).rejects.toThrow(
			"Turso Platform database response was malformed",
		);
	});

	it("deletes databases", async () => {
		const fetchMock = jest.fn().mockResolvedValueOnce(response(204, null));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.deleteDatabase("db-one")).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.turso.tech/v1/organizations/acme/databases/db-one",
			expect.objectContaining({ method: "DELETE" }),
		);
	});

	it("tolerates deleting an absent database", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(response(404, { error: "not found" }, false));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.deleteDatabase("db-one")).resolves.toBeUndefined();
	});

	it("throws platform errors when database deletion fails", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(response(500, { error: "delete failed" }, false));
		const client = createTursoPlatformClient(config, fetchMock as typeof fetch);

		await expect(client.deleteDatabase("db-one")).rejects.toMatchObject({
			name: "TursoPlatformError",
			status: 500,
			message:
				'Turso Platform request failed with 500: {"error":"delete failed"}',
			details: '{"error":"delete failed"}',
		} satisfies Partial<TursoPlatformError>);
	});
});

const config: TursoOperatorConfig = {
	appEnv: "test",
	directoryAuthToken: "directory-token",
	directoryUrl: "libsql://directory.turso.io",
	group: "dont-forget-test",
	org: "acme",
	platformApiToken: "platform-token",
	platformGroupToken: "group-token",
};

function response(status: number, body: unknown, ok = true) {
	return {
		ok,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	};
}

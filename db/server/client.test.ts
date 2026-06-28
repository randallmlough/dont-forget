import { createClient } from "@libsql/client/http";
import { directoryClient, householdClient, householdDbUrl } from "./client";
import { postgresPool } from "./pg-client";

jest.mock("@libsql/client/http", () => ({
	createClient: jest.fn((config: unknown) => ({ config, close: jest.fn() })),
}));

jest.mock("./pg-client", () => ({
	postgresPool: jest.fn(() => ({ end: jest.fn() })),
}));

describe("remote DB clients", () => {
	beforeEach(() => {
		process.env.APP_ENV = "local";
		process.env.DATABASE_URL = "postgres://directory";
		process.env.TURSO_DIRECTORY_AUTH_TOKEN = "directory-token";
		process.env.TURSO_DIRECTORY_URL = "libsql://directory-randy.turso.io";
		process.env.TURSO_GROUP = "dont-forget-local-randy";
		process.env.TURSO_ORG = "randy";
		jest.clearAllMocks();
	});

	it("uses Postgres for the directory client and libsql for Household clients", () => {
		directoryClient();
		householdClient("libsql://household-randy.turso.io", "household-token");

		expect(postgresPool).toHaveBeenCalledTimes(1);
		expect(createClient).toHaveBeenCalledTimes(1);
		expect(createClient).toHaveBeenCalledWith({
			url: "libsql://household-randy.turso.io",
			authToken: "household-token",
		});
	});

	it("maps the default libsql import to the HTTP entrypoint in tests", () => {
		const defaultClient = jest.requireMock(
			"@libsql/client",
		) as typeof import("@libsql/client/http");

		expect(defaultClient.createClient).toBe(createClient);
	});

	it("builds remote Household DB URLs", () => {
		expect(householdDbUrl("dont-forget-local-randy-household-abc")).toBe(
			"libsql://dont-forget-local-randy-household-abc-randy.turso.io",
		);
	});
});

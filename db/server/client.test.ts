import { directoryClient } from "./client";
import { postgresPool } from "./pg-client";

jest.mock("./pg-client", () => ({
	postgresPool: jest.fn(() => ({ end: jest.fn() })),
}));

describe("remote DB clients", () => {
	beforeEach(() => {
		process.env.APP_ENV = "local";
		process.env.DATABASE_URL = "postgres://directory";
		jest.clearAllMocks();
	});

	it("uses Postgres for the directory client", () => {
		directoryClient();

		expect(postgresPool).toHaveBeenCalledTimes(1);
	});
});

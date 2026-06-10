import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createTestHouseholdDb } from "@/db/test";
import { DRIZZLE_MIGRATIONS_TABLE } from "@/db/utils";
import {
	EXPECTED_HOUSEHOLD_SCHEMA_VERSION,
	ensureHouseholdSchemaReady,
} from "@/lib/services/household/household-schema";
import type { HouseholdStoreExecutor } from "@/lib/services/household/household-store";
import { loggerFixture } from "@/lib/test/mocks/logger";

const EXPECTED = EXPECTED_HOUSEHOLD_SCHEMA_VERSION;

function storeWithVersions(versions: (number | Error)[]): {
	store: HouseholdStoreExecutor;
	executeCalls: () => number;
} {
	let call = 0;
	return {
		store: {
			async execute() {
				const version = versions[Math.min(call, versions.length - 1)];
				call += 1;
				if (version instanceof Error) throw version;
				return { rows: [{ version }] };
			},
		},
		executeCalls: () => call,
	};
}

describe("ensureHouseholdSchemaReady", () => {
	it("is ready without syncing when the local schema matches the build", async () => {
		const { store } = storeWithVersions([EXPECTED]);
		const sync = jest.fn();

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: loggerFixture().root,
		});

		expect(readiness).toEqual({ status: "ready", healedBySync: false });
		expect(sync).not.toHaveBeenCalled();
	});

	it("warns and proceeds when the local schema is newer than the build", async () => {
		const { store } = storeWithVersions([EXPECTED + 1]);
		const sync = jest.fn();
		const logger = loggerFixture();

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: logger.root,
		});

		expect(readiness).toEqual({ status: "ready", healedBySync: false });
		expect(sync).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			"household schema is newer than this app build",
			expect.objectContaining({ local_schema_version: EXPECTED + 1 }),
		);
	});

	it("syncs once and heals a stale replica before reads", async () => {
		const { store } = storeWithVersions([EXPECTED - 1, EXPECTED]);
		const sync = jest.fn().mockResolvedValue({ changed: true });

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: loggerFixture().root,
		});

		expect(readiness).toEqual({ status: "ready", healedBySync: true });
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it("proceeds as stale when the sync fails (offline open)", async () => {
		const { store } = storeWithVersions([EXPECTED - 1]);
		const sync = jest.fn().mockRejectedValue(new Error("offline"));

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: loggerFixture().root,
		});

		expect(readiness).toEqual({ status: "stale", healedBySync: false });
	});

	it("proceeds as stale when the sync completes but the remote was not migrated", async () => {
		const { store } = storeWithVersions([EXPECTED - 1, EXPECTED - 1]);
		const sync = jest.fn().mockResolvedValue({ changed: false });
		const logger = loggerFixture();

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: logger.root,
		});

		expect(readiness).toEqual({ status: "stale", healedBySync: false });
		expect(logger.warn).toHaveBeenCalledWith(
			"household schema still stale after sync",
			expect.objectContaining({ local_schema_version: EXPECTED - 1 }),
		);
	});

	it("treats a missing tracking table as the oldest schema and syncs", async () => {
		const { store } = storeWithVersions([
			new Error("no such table: __drizzle_migrations"),
			EXPECTED,
		]);
		const sync = jest.fn().mockResolvedValue({ changed: true });
		const logger = loggerFixture();

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: logger.root,
		});

		expect(readiness).toEqual({ status: "ready", healedBySync: true });
		expect(sync).toHaveBeenCalledTimes(1);
		expect(logger.warn).not.toHaveBeenCalledWith(
			"household schema version read failed",
			expect.anything(),
		);
	});

	it("logs unexpected version-read failures instead of hiding them", async () => {
		const { store } = storeWithVersions([new Error("database is locked")]);
		const sync = jest.fn().mockRejectedValue(new Error("offline"));
		const logger = loggerFixture();

		const readiness = await ensureHouseholdSchemaReady({
			store,
			sync,
			logger: logger.root,
		});

		expect(readiness).toEqual({ status: "stale", healedBySync: false });
		expect(logger.warn).toHaveBeenCalledWith(
			"household schema version read failed",
			expect.objectContaining({ error: expect.any(Error) }),
		);
	});

	it("stops waiting for a hung sync and proceeds stale", async () => {
		jest.useFakeTimers();
		try {
			const { store } = storeWithVersions([EXPECTED - 1]);
			const sync = jest.fn().mockReturnValue(new Promise(() => {}));

			const readinessPromise = ensureHouseholdSchemaReady({
				store,
				sync,
				logger: loggerFixture().root,
			});
			await jest.advanceTimersByTimeAsync(5_000);

			await expect(readinessPromise).resolves.toEqual({
				status: "stale",
				healedBySync: false,
			});
		} finally {
			jest.useRealTimers();
		}
	});

	it("reads a DB migrated by the real drizzle migrator as ready", async () => {
		const directory = await mkdtemp(
			path.join(tmpdir(), "household-schema-gate-"),
		);
		const client = createClient({
			url: `file:${path.join(directory, "household.db")}`,
		});
		try {
			await migrate(drizzle(client), {
				migrationsFolder: "db/migrations/household",
				migrationsTable: DRIZZLE_MIGRATIONS_TABLE,
			});
			const store: HouseholdStoreExecutor = {
				execute: async (statement) => client.execute(statement.sql),
			};
			const sync = jest.fn();

			const readiness = await ensureHouseholdSchemaReady({
				store,
				sync,
				logger: loggerFixture().root,
			});

			expect(readiness).toEqual({ status: "ready", healedBySync: false });
			expect(sync).not.toHaveBeenCalled();
		} finally {
			client.close();
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("reads a test-helper Household DB as ready", async () => {
		const household = await createTestHouseholdDb();
		try {
			const store: HouseholdStoreExecutor = {
				execute: async (statement) => household.client.execute(statement.sql),
			};
			const sync = jest.fn();

			const readiness = await ensureHouseholdSchemaReady({
				store,
				sync,
				logger: loggerFixture().root,
			});

			expect(readiness).toEqual({ status: "ready", healedBySync: false });
			expect(sync).not.toHaveBeenCalled();
		} finally {
			await household.close();
		}
	});
});

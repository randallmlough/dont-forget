import {
	deleteLocalHouseholdDbData,
	householdDbFilename,
	openHouseholdDb,
	type TursoHouseholdDbRuntime,
} from "@/lib/app/household-db";

const mockLoggerError = jest.fn();
const mockLogger = {
	error: mockLoggerError,
};

jest.mock("@/lib/logger", () => ({
	logger: {
		with: jest.fn(() => mockLogger),
	},
}));

describe("openHouseholdDb", () => {
	let instances: MockTursoDatabase[];
	let runtime: TursoHouseholdDbRuntime;
	let fileSystem: { deleteFilesWithPrefix: jest.Mock<Promise<void>, [string]> };

	beforeEach(() => {
		mockLoggerError.mockReset();
		instances = [];
		runtime = {
			Database: class extends MockTursoDatabase {
				constructor(
					options: ConstructorParameters<
						TursoHouseholdDbRuntime["Database"]
					>[0],
				) {
					super(options);
					instances.push(this);
				}
			},
			getDbPath: jest.fn((filename: string) => `/documents/${filename}`),
		};
		fileSystem = {
			deleteFilesWithPrefix: jest.fn<Promise<void>, [string]>(
				async (_path) => undefined,
			),
		};
	});

	it("opens a synced local DB path keyed by app-owned Household ID", async () => {
		const db = await openHouseholdDb(configFixture(), { runtime, fileSystem });
		const nativeDb = onlyInstance(instances);

		expect(runtime.getDbPath).toHaveBeenCalledWith("household-hh_avery.db");
		expect(nativeDb.options).toEqual({
			path: "/documents/household-hh_avery.db",
			url: "libsql://remote-household.turso.io",
			authToken: "household-token",
			clientName: "dont-forget-household-db",
			bootstrapIfEmpty: true,
		});
		expect(nativeDb.connect).toHaveBeenCalledTimes(1);
		expect(db.path).toBe("/documents/household-hh_avery.db");
		expect(db.syncAuthorized).toBe(true);
	});

	it("opens cached local DB data without remote sync credentials", async () => {
		const db = await openHouseholdDb(
			{
				householdId: "hh_avery",
				database: {
					url: "libsql://remote-household.turso.io",
					expiresAt: 1_700_000_000_000,
				},
			},
			{ runtime, fileSystem },
		);
		const nativeDb = onlyInstance(instances);

		expect(nativeDb.options).toEqual({
			path: "/documents/household-hh_avery.db",
			clientName: "dont-forget-household-db",
			bootstrapIfEmpty: false,
		});
		expect(db.syncAuthorized).toBe(false);
	});

	it("adapts query and write results into the app SQL result shape", async () => {
		const db = await openHouseholdDb(configFixture(), { runtime, fileSystem });
		const nativeDb = onlyInstance(instances);
		nativeDb.allRows = [{ id: "itm_milk", position: 1 }];
		nativeDb.runResult = { changes: 2, lastInsertRowid: 42 };

		await expect(
			db.execute({
				sql: "SELECT id, position FROM items WHERE list_id = ?",
				args: ["lst_groceries"],
			}),
		).resolves.toEqual({
			rows: [{ id: "itm_milk", position: 1 }],
			rowsAffected: 0,
			lastInsertRowId: null,
		});
		expect(nativeDb.all).toHaveBeenCalledWith(
			"SELECT id, position FROM items WHERE list_id = ?",
			["lst_groceries"],
		);

		await expect(
			db.execute({
				sql: "INSERT INTO items (id, name) VALUES (?, ?)",
				args: ["itm_eggs", "Eggs"],
			}),
		).resolves.toEqual({ rows: [], rowsAffected: 2, lastInsertRowId: 42 });
		expect(nativeDb.run).toHaveBeenCalledWith(
			"INSERT INTO items (id, name) VALUES (?, ?)",
			["itm_eggs", "Eggs"],
		);
	});

	it("wraps push, pull, sync, close, and local deletion", async () => {
		const db = await openHouseholdDb(configFixture(), { runtime, fileSystem });
		const nativeDb = onlyInstance(instances);

		nativeDb.pullResult = true;
		await db.push();
		await expect(db.pull()).resolves.toEqual({ changed: true });

		nativeDb.pullResults = [true, false];
		await expect(db.sync()).resolves.toEqual({ changed: true });

		expect(nativeDb.push).toHaveBeenCalledTimes(2);
		expect(nativeDb.pull).toHaveBeenCalledTimes(3);
		expect(nativeDb.calls.slice(-3)).toEqual(["pull", "push", "pull"]);

		await db.deleteLocalData();
		await db.close();

		expect(nativeDb.close).toHaveBeenCalledTimes(1);
		expect(fileSystem.deleteFilesWithPrefix).toHaveBeenCalledWith(
			"/documents/household-hh_avery.db",
		);
	});

	it("logs native sync failures before rethrowing", async () => {
		const db = await openHouseholdDb(configFixture(), { runtime, fileSystem });
		const nativeDb = onlyInstance(instances);
		const error = new Error("checkpoint failed");
		nativeDb.push.mockRejectedValueOnce(error);

		await expect(db.sync()).rejects.toThrow(error);

		expect(mockLoggerError).toHaveBeenCalledWith("household db sync failed", {
			error,
		});
	});

	it("deletes local DB files by app-owned Household ID", async () => {
		await deleteLocalHouseholdDbData("hh_avery", { runtime, fileSystem });

		expect(runtime.getDbPath).toHaveBeenCalledWith("household-hh_avery.db");
		expect(fileSystem.deleteFilesWithPrefix).toHaveBeenCalledWith(
			"/documents/household-hh_avery.db",
		);
	});

	it("rejects Household IDs that cannot be used as local filenames", () => {
		expect(householdDbFilename("hh_avery")).toBe("household-hh_avery.db");
		expect(() => householdDbFilename("../remote-db-name")).toThrow(
			"Household ID cannot be used as a local DB filename",
		);
	});
});

class MockTursoDatabase {
	allRows: Array<Record<string, unknown>> = [];
	runResult = { changes: 0, lastInsertRowid: 0 };
	pullResult = false;
	pullResults: boolean[] = [];
	calls: string[] = [];

	connect = jest.fn(async () => undefined);
	all = jest.fn(async () => this.allRows);
	run = jest.fn(async () => this.runResult);
	push = jest.fn(async () => {
		this.calls.push("push");
	});
	pull = jest.fn(async () => {
		this.calls.push("pull");
		return this.pullResults.shift() ?? this.pullResult;
	});
	close = jest.fn(async () => undefined);

	constructor(
		public readonly options: ConstructorParameters<
			TursoHouseholdDbRuntime["Database"]
		>[0],
	) {}
}

function configFixture() {
	return {
		householdId: "hh_avery",
		database: {
			url: "libsql://remote-household.turso.io",
			authToken: "household-token",
			expiresAt: 1_700_000_000_000,
		},
	};
}

function onlyInstance(instances: MockTursoDatabase[]): MockTursoDatabase {
	const instance = instances[0];
	if (!instance) {
		throw new Error("Expected a native DB instance");
	}

	return instance;
}

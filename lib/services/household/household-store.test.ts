import { logger as defaultLogger } from "@/lib/logger";
import {
	deleteLocalHouseholdStoreData,
	householdStoreFilename,
	openHouseholdStore,
	type TursoHouseholdStoreRuntime,
} from "@/lib/services/household/household-store";
import { SyncInterruptedError } from "@/lib/services/sync";
import { deferred } from "@/lib/test/async";
import {
	createMockLogger,
	loggerFixture,
	type MockLogger,
} from "@/lib/test/mocks/logger";

let defaultScopedLogger: MockLogger;

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

describe("openHouseholdStore", () => {
	let instances: MockTursoDatabase[];
	let runtime: TursoHouseholdStoreRuntime;
	let fileSystem: { deleteFilesWithPrefix: jest.Mock<Promise<void>, [string]> };

	beforeEach(() => {
		defaultScopedLogger = createMockLogger();
		defaultScopedLogger.with.mockReturnValue(defaultScopedLogger);
		jest.mocked(defaultLogger.with).mockReturnValue(defaultScopedLogger);
		instances = [];
		runtime = {
			Database: class extends MockTursoDatabase {
				constructor(
					options: ConstructorParameters<
						TursoHouseholdStoreRuntime["Database"]
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

	it("opens a synced local store path keyed by app-owned Household ID", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
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
		expect(store.path).toBe("/documents/household-hh_avery.db");
		expect(store.syncAuthorized).toBe(true);
	});

	it("opens cached local store data without remote sync credentials", async () => {
		const store = await openHouseholdStore(
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
		expect(store.syncAuthorized).toBe(false);
	});

	it("adapts query and write results into the app SQL result shape", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		nativeDb.allRows = [{ id: "itm_milk", position: 1 }];
		nativeDb.runResult = { changes: 2, lastInsertRowid: 42 };

		await expect(
			store.execute({
				kind: "read",
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
			store.execute({
				kind: "write",
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
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);

		nativeDb.pullResult = true;
		await store.push();
		await expect(store.pull()).resolves.toEqual({ changed: true });

		nativeDb.pullResults = [true, false];
		await expect(store.sync()).resolves.toEqual({ changed: true });

		expect(nativeDb.push).toHaveBeenCalledTimes(2);
		expect(nativeDb.pull).toHaveBeenCalledTimes(3);
		expect(nativeDb.calls.slice(-3)).toEqual(["pull", "push", "pull"]);

		await store.deleteLocalData();
		await store.close();

		expect(nativeDb.close).toHaveBeenCalledTimes(1);
		expect(fileSystem.deleteFilesWithPrefix).toHaveBeenCalledWith(
			"/documents/household-hh_avery.db",
		);
	});

	it("serializes native database operations on one store handle", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		nativeDb.calls = [];
		const push = deferred<void>();
		nativeDb.push.mockImplementationOnce(async () => {
			nativeDb.calls.push("push");
			return push.promise;
		});

		const sync = store.sync();
		await Promise.resolve();
		const write = store.execute({
			kind: "write",
			sql: "INSERT INTO items (id, name) VALUES (?, ?)",
			args: ["itm_eggs", "Eggs"],
		});
		await Promise.resolve();

		expect(nativeDb.run).not.toHaveBeenCalled();

		push.resolve();
		await Promise.all([sync, write]);

		expect(nativeDb.calls).toEqual(["pull", "push", "pull", "run"]);
	});

	it("rethrows native sync failures without logging at the store boundary", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const error = new Error("checkpoint failed");
		nativeDb.push.mockRejectedValueOnce(error);

		await expect(store.sync()).rejects.toThrow(error);

		expect(defaultScopedLogger.error).not.toHaveBeenCalled();
	});

	it("wraps offline native sync failures as typed sync interruptions", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const error = new TypeError("Network request failed");
		nativeDb.push.mockRejectedValueOnce(error);

		await expect(store.sync()).rejects.toBeInstanceOf(SyncInterruptedError);

		expect(defaultScopedLogger.error).not.toHaveBeenCalled();
	});

	it("wraps recoverable sync engine failures as typed sync interruptions", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const error = new Error(
			"sync engine operation failed: database sync engine error: unable to checkpoint synced portion of WAL",
		);
		nativeDb.push.mockRejectedValueOnce(error);

		await expect(store.sync()).rejects.toBeInstanceOf(SyncInterruptedError);

		expect(defaultScopedLogger.error).not.toHaveBeenCalled();
	});

	it("does not use an injected logger for native sync failures", async () => {
		const injected = loggerFixture();
		const store = await openHouseholdStore(
			{ ...configFixture(), logger: injected.root },
			{ runtime, fileSystem },
		);
		const nativeDb = onlyInstance(instances);
		const error = new Error("checkpoint failed");
		nativeDb.push.mockRejectedValueOnce(error);

		await expect(store.sync()).rejects.toThrow(error);

		expect(injected.with).toHaveBeenCalledWith({
			household_id: "hh_avery",
			sync_authorized: true,
		});
		expect(injected.error).not.toHaveBeenCalled();
		expect(defaultScopedLogger.error).not.toHaveBeenCalled();
	});

	it("continues to log local write failures because they affect data safety", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const error = new Error("disk write failed");
		nativeDb.run.mockRejectedValueOnce(error);

		await expect(
			store.execute({
				kind: "write",
				sql: "INSERT INTO items (id, name) VALUES (?, ?)",
				args: ["itm_eggs", "Eggs"],
			}),
		).rejects.toThrow(error);

		expect(defaultScopedLogger.error).toHaveBeenCalledWith(
			"household store write failed",
			{
				error,
			},
		);
	});

	it("deletes local store files by app-owned Household ID", async () => {
		await deleteLocalHouseholdStoreData("hh_avery", { runtime, fileSystem });

		expect(runtime.getDbPath).toHaveBeenCalledWith("household-hh_avery.db");
		expect(fileSystem.deleteFilesWithPrefix).toHaveBeenCalledWith(
			"/documents/household-hh_avery.db",
		);
	});

	it("rejects Household IDs that cannot be used as local filenames", () => {
		expect(householdStoreFilename("hh_avery")).toBe("household-hh_avery.db");
		expect(() => householdStoreFilename("../remote-db-name")).toThrow(
			"Household ID cannot be used as a local store filename",
		);
	});
});

class MockTursoDatabase {
	allRows: Record<string, unknown>[] = [];
	runResult = { changes: 0, lastInsertRowid: 0 };
	pullResult = false;
	pullResults: boolean[] = [];
	calls: string[] = [];

	connect = jest.fn(async () => undefined);
	all = jest.fn(async () => {
		this.calls.push("all");
		return this.allRows;
	});
	run = jest.fn(async () => {
		this.calls.push("run");
		return this.runResult;
	});
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
			TursoHouseholdStoreRuntime["Database"]
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

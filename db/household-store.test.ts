import {
	deleteLocalHouseholdStoreData,
	householdStoreFilename,
	openHouseholdStore,
	SyncInterruptedError,
	type TursoHouseholdStoreRuntime,
} from "@/db/household-store";
import { logger as defaultLogger } from "@/lib/logger";
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

	it("notifies listeners after successful writes but not reads", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const listener = jest.fn();
		store.subscribeToChanges(listener);

		await store.execute({
			kind: "read",
			sql: "SELECT id FROM items",
		});
		expect(listener).not.toHaveBeenCalled();

		await store.execute({
			kind: "write",
			sql: "INSERT INTO items (id, name) VALUES (?, ?)",
			args: ["itm_eggs", "Eggs"],
		});
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("notifies listeners only when pull reports changed Household data", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const listener = jest.fn();
		store.subscribeToChanges(listener);

		nativeDb.pullResult = false;
		await expect(store.pull()).resolves.toEqual({ changed: false });
		expect(listener).not.toHaveBeenCalled();

		nativeDb.pullResult = true;
		await expect(store.pull()).resolves.toEqual({ changed: true });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("notifies listeners when sync reports changed Household data", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const listener = jest.fn();
		store.subscribeToChanges(listener);

		nativeDb.pullResults = [false, false];
		await expect(store.sync()).resolves.toEqual({ changed: false });
		expect(listener).not.toHaveBeenCalled();

		nativeDb.pullResults = [false, true];
		await expect(store.sync()).resolves.toEqual({ changed: true });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("logs listener failures and continues notifying other listeners", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const error = new Error("listener failed");
		const failingListener = jest.fn(() => {
			throw error;
		});
		const succeedingListener = jest.fn();
		store.subscribeToChanges(failingListener);
		store.subscribeToChanges(succeedingListener);

		await store.execute({
			kind: "write",
			sql: "INSERT INTO items (id, name) VALUES (?, ?)",
			args: ["itm_eggs", "Eggs"],
		});

		expect(failingListener).toHaveBeenCalledTimes(1);
		expect(succeedingListener).toHaveBeenCalledTimes(1);
		expect(defaultScopedLogger.error).toHaveBeenCalledWith(
			"household store change listener failed",
			{ error },
		);
	});

	it("removes change listeners", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const listener = jest.fn();
		const subscription = store.subscribeToChanges(listener);

		subscription.remove();
		await store.execute({
			kind: "write",
			sql: "INSERT INTO items (id, name) VALUES (?, ?)",
			args: ["itm_eggs", "Eggs"],
		});

		expect(listener).not.toHaveBeenCalled();
	});

	it("clears listeners on close and never notifies listeners added after close", async () => {
		const store = await openHouseholdStore(configFixture(), {
			runtime,
			fileSystem,
		});
		const nativeDb = onlyInstance(instances);
		const listenerBeforeClose = jest.fn();
		const listenerAfterClose = jest.fn();
		store.subscribeToChanges(listenerBeforeClose);

		await store.close();
		store.subscribeToChanges(listenerAfterClose);
		nativeDb.pullResult = true;
		await expect(store.pull()).resolves.toEqual({ changed: true });

		expect(listenerBeforeClose).not.toHaveBeenCalled();
		expect(listenerAfterClose).not.toHaveBeenCalled();
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

import type {
	PowerSyncBackendConnector,
	PowerSyncDatabase,
	QueryResult,
	SyncStatus,
	Transaction,
} from "@powersync/react-native";
import { createPowerSyncAppDatabase } from "./database";

jest.mock("./powersync", () => ({ db: {} }));

describe("createPowerSyncAppDatabase", () => {
	it("adapts direct SQL calls to the product data store contract", async () => {
		const database = powerSyncDatabaseFixture({
			executeResult: queryResult({
				rowsAffected: 2,
				rows: [{ id: "row_1", name: "Milk" }],
			}),
		});
		const appDatabase = createPowerSyncAppDatabase(
			asPowerSyncDatabase(database),
		);
		const parameters = Object.freeze(["lst_1"]);

		await expect(
			appDatabase.execute("SELECT * FROM lists WHERE id = ?", parameters),
		).resolves.toEqual({
			rowsAffected: 2,
			rows: [{ id: "row_1", name: "Milk" }],
		});

		expect(database.execute).toHaveBeenCalledWith(
			"SELECT * FROM lists WHERE id = ?",
			["lst_1"],
		);
		expect(database.execute.mock.calls[0][1]).not.toBe(parameters);
	});

	it("wraps PowerSync write transactions with product executors", async () => {
		const transaction = transactionFixture({
			executeResult: queryResult({
				rowsAffected: 1,
				rows: [{ id: "itm_1" }],
			}),
		});
		const database = powerSyncDatabaseFixture({ transaction });
		const appDatabase = createPowerSyncAppDatabase(
			asPowerSyncDatabase(database),
		);

		const result = await appDatabase.writeTransaction((tx) =>
			tx.execute("INSERT INTO items VALUES (?)", ["itm_1"]),
		);

		expect(result).toEqual({
			rowsAffected: 1,
			rows: [{ id: "itm_1" }],
		});
		expect(database.writeTransaction).toHaveBeenCalledTimes(1);
		expect(transaction.execute).toHaveBeenCalledWith(
			"INSERT INTO items VALUES (?)",
			["itm_1"],
		);
	});

	it("subscribes changes to product tables only", () => {
		const dispose = jest.fn();
		const database = powerSyncDatabaseFixture({ onChangeDispose: dispose });
		const appDatabase = createPowerSyncAppDatabase(
			asPowerSyncDatabase(database),
		);
		const listener = jest.fn();

		const subscription = appDatabase.changes.subscribe(listener);
		const [delegate, options] = database.onChange.mock.calls[0];

		delegate.onChange();
		subscription.remove();

		expect(options).toEqual({ tables: ["lists", "items", "item_checks"] });
		expect(listener).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it("passes connection lifecycle calls through to PowerSync", async () => {
		const database = powerSyncDatabaseFixture();
		const appDatabase = createPowerSyncAppDatabase(
			asPowerSyncDatabase(database),
		);
		const connector: PowerSyncBackendConnector = {
			fetchCredentials: jest.fn(async () => null),
			uploadData: jest.fn(async () => undefined),
		};

		await appDatabase.connect(connector);
		await appDatabase.disconnect();
		await appDatabase.disconnectAndClear();

		expect(database.connect).toHaveBeenCalledWith(connector);
		expect(database.disconnect).toHaveBeenCalledTimes(1);
		expect(database.disconnectAndClear).toHaveBeenCalledTimes(1);
	});

	it.each([
		["synced", statusFixture({ connected: true, hasSynced: true })],
		["pending", statusFixture({ connected: true, hasSynced: false })],
		["pending", statusFixture({ connected: false, connecting: true })],
		["offline", statusFixture({ connected: false })],
		["failed", statusFixture({ uploadError: new Error("upload failed") })],
	] as const)("maps PowerSync status to %s", (expected, status) => {
		const database = powerSyncDatabaseFixture({ status });
		const appDatabase = createPowerSyncAppDatabase(
			asPowerSyncDatabase(database),
		);

		expect(appDatabase.getStatus()).toBe(expected);
	});

	it("subscribes to PowerSync status changes", () => {
		const dispose = jest.fn();
		const database = powerSyncDatabaseFixture({ registerDispose: dispose });
		const appDatabase = createPowerSyncAppDatabase(
			asPowerSyncDatabase(database),
		);
		const listener = jest.fn();

		const subscription = appDatabase.subscribeStatus(listener);
		const [delegate] = database.registerListener.mock.calls[0];

		delegate.statusChanged();
		subscription.remove();

		expect(listener).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});

type ChangeDelegate = {
	onChange(): void;
};

type ListenerDelegate = {
	statusChanged(): void;
};

type PowerSyncDatabaseFixture = {
	currentStatus: SyncStatus;
	execute: jest.Mock<
		Promise<QueryResult>,
		[sql: string, parameters?: unknown[]]
	>;
	getAll: jest.Mock<Promise<unknown[]>, [sql: string, parameters?: unknown[]]>;
	getOptional: jest.Mock<
		Promise<unknown | null>,
		[sql: string, parameters?: unknown[]]
	>;
	writeTransaction: jest.Mock<
		Promise<unknown>,
		[run: (tx: Transaction) => Promise<unknown>]
	>;
	onChange: jest.Mock<
		() => void,
		[delegate: ChangeDelegate, options: { tables: string[] }]
	>;
	connect: jest.Mock<Promise<void>, [connector: PowerSyncBackendConnector]>;
	disconnect: jest.Mock<Promise<void>, []>;
	disconnectAndClear: jest.Mock<Promise<void>, []>;
	registerListener: jest.Mock<() => void, [delegate: ListenerDelegate]>;
};

type TransactionFixture = {
	execute: jest.Mock<
		Promise<QueryResult>,
		[sql: string, parameters?: unknown[]]
	>;
	getAll: jest.Mock<Promise<unknown[]>, [sql: string, parameters?: unknown[]]>;
	getOptional: jest.Mock<
		Promise<unknown | null>,
		[sql: string, parameters?: unknown[]]
	>;
};

function powerSyncDatabaseFixture(
	options: {
		executeResult?: QueryResult;
		onChangeDispose?: () => void;
		registerDispose?: () => void;
		status?: SyncStatus;
		transaction?: TransactionFixture;
	} = {},
): PowerSyncDatabaseFixture {
	const transaction = options.transaction ?? transactionFixture();
	return {
		currentStatus:
			options.status ?? statusFixture({ connected: true, hasSynced: true }),
		execute: jest.fn(
			async (_sql: string, _parameters?: unknown[]) =>
				options.executeResult ?? queryResult({ rowsAffected: 0 }),
		),
		getAll: jest.fn(async (_sql: string, _parameters?: unknown[]) => []),
		getOptional: jest.fn(async (_sql: string, _parameters?: unknown[]) => null),
		writeTransaction: jest.fn((run) => run(asTransaction(transaction))),
		onChange: jest.fn(
			(_delegate: ChangeDelegate, _options: { tables: string[] }) =>
				options.onChangeDispose ?? noop,
		),
		connect: jest.fn(async (_connector) => undefined),
		disconnect: jest.fn(async () => undefined),
		disconnectAndClear: jest.fn(async () => undefined),
		registerListener: jest.fn(
			(_delegate: ListenerDelegate) => options.registerDispose ?? noop,
		),
	};
}

function transactionFixture(
	options: { executeResult?: QueryResult } = {},
): TransactionFixture {
	return {
		execute: jest.fn(
			async (_sql: string, _parameters?: unknown[]) =>
				options.executeResult ?? queryResult({ rowsAffected: 0 }),
		),
		getAll: jest.fn(async (_sql: string, _parameters?: unknown[]) => []),
		getOptional: jest.fn(async (_sql: string, _parameters?: unknown[]) => null),
	};
}

function queryResult(input: {
	rowsAffected: number;
	rows?: Record<string, unknown>[];
}): QueryResult {
	const rows = input.rows
		? {
				_array: input.rows,
				length: input.rows.length,
				item(index: number) {
					return input.rows?.[index];
				},
			}
		: undefined;
	const result: QueryResult = {
		rowsAffected: input.rowsAffected,
		rows,
	};
	return result;
}

function statusFixture(input: {
	connected?: boolean;
	connecting?: boolean;
	hasSynced?: boolean;
	downloadError?: Error;
	uploadError?: Error;
}): SyncStatus {
	const status = Object.assign(Object.create(null) as SyncStatus, {
		connected: input.connected ?? false,
		connecting: input.connecting ?? false,
		hasSynced: input.hasSynced ?? false,
		dataFlowStatus: {
			downloading: false,
			uploading: false,
			downloadError: input.downloadError,
			uploadError: input.uploadError,
		},
	});
	return status;
}

function asPowerSyncDatabase(
	database: PowerSyncDatabaseFixture,
): PowerSyncDatabase {
	return database as unknown as PowerSyncDatabase;
}

function asTransaction(transaction: TransactionFixture): Transaction {
	return transaction as unknown as Transaction;
}

function noop(): void {}

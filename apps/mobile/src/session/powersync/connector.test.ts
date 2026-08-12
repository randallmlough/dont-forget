import { UpdateType } from "@powersync/common";

import {
	PowerSyncConnector,
	type PowerSyncConnectorDeps,
	type PowerSyncUploadDatabase,
} from "./connector";

type TokenGetterMock = jest.Mock<Promise<string | null>, []>;
type FetchMock = jest.Mock<ReturnType<typeof fetch>, Parameters<typeof fetch>>;
type UploadTransaction = NonNullable<
	Awaited<ReturnType<PowerSyncUploadDatabase["getNextCrudTransaction"]>>
>;

const originalFetch = global.fetch;
let activeFetchMock: FetchMock | undefined;

describe("PowerSyncConnector", () => {
	let fetchMock: FetchMock;

	beforeEach(() => {
		fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
		Object.defineProperty(global, "fetch", {
			configurable: true,
			writable: true,
			value: fetchMock,
		});
		activeFetchMock = fetchMock;
	});

	afterEach(() => {
		activeFetchMock = undefined;
		Object.defineProperty(global, "fetch", {
			configurable: true,
			writable: true,
			value: originalFetch,
		});
	});

	it("completes the transaction after a successful upload", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(200));

		await connector.uploadData(database);

		expect(tx.complete).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/data", {
			method: "POST",
			headers: {
				Authorization: "Bearer session-token",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				batch: [
					{
						op: "PUT",
						table: "items",
						id: "itm_x",
						data: { name: "Milk", updated_at: "2026-06-21T00:00:00.000Z" },
					},
				],
			}),
		});
	});

	it("discards terminal 403 uploads by completing the transaction", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(403));

		await connector.uploadData(database);

		expect(tx.complete).toHaveBeenCalledTimes(1);
	});

	it("discards terminal 409 uploads by completing the transaction", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(409));

		await connector.uploadData(database);

		expect(tx.complete).toHaveBeenCalledTimes(1);
	});

	it("discards terminal 413 uploads by completing the transaction", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(413));

		await expect(connector.uploadData(database)).resolves.toBeUndefined();

		expect(tx.complete).toHaveBeenCalledTimes(1);
	});

	it("discards terminal 400 uploads by completing the transaction", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(400));

		await connector.uploadData(database);

		expect(tx.complete).toHaveBeenCalledTimes(1);
	});

	it("throws and keeps the transaction queued for transient 5xx and network failures", async () => {
		const { connector } = createConnector();
		const serverTx = createTransaction();
		fetchMock.mockResolvedValueOnce(responseWithStatus(500));

		await expect(
			connector.uploadData(createDatabase(serverTx)),
		).rejects.toThrow("Data upload failed with status 500");
		expect(serverTx.complete).not.toHaveBeenCalled();

		const networkTx = createTransaction();
		fetchMock.mockRejectedValueOnce(new Error("network down"));

		await expect(
			connector.uploadData(createDatabase(networkTx)),
		).rejects.toThrow("network down");
		expect(networkTx.complete).not.toHaveBeenCalled();
	});

	it("throws and keeps the transaction queued for 429 rate limits", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(429));

		await expect(connector.uploadData(database)).rejects.toThrow(
			"Data upload failed with status 429",
		);
		expect(tx.complete).not.toHaveBeenCalled();
	});

	it("throws and keeps the transaction queued for 401 (refreshable auth)", async () => {
		const { connector } = createConnector();
		const tx = createTransaction();
		const database = createDatabase(tx);
		fetchMock.mockResolvedValue(responseWithStatus(401));

		await expect(connector.uploadData(database)).rejects.toThrow(
			"Data upload failed with status 401",
		);
		expect(tx.complete).not.toHaveBeenCalled();
	});

	it("uses the PowerSync token for sync credentials and the session token for uploads", async () => {
		const { connector, powersyncGetToken, sessionGetToken } = createConnector();
		fetchMock.mockResolvedValue(responseWithStatus(200));

		await expect(connector.fetchCredentials()).resolves.toEqual({
			endpoint: "https://sync.test",
			token: "powersync-token",
		});
		expect(powersyncGetToken).toHaveBeenCalledTimes(1);
		expect(sessionGetToken).not.toHaveBeenCalled();

		powersyncGetToken.mockClear();
		sessionGetToken.mockClear();

		await connector.uploadData(createDatabase(createTransaction()));

		expect(sessionGetToken).toHaveBeenCalledTimes(1);
		expect(powersyncGetToken).not.toHaveBeenCalled();
		expectFetchAuthorization("Bearer session-token");
	});

	it("returns null sync credentials when Clerk returns no PowerSync token", async () => {
		const { connector } = createConnector({ powersyncToken: null });

		await expect(connector.fetchCredentials()).resolves.toBeNull();
	});

	it("returns without uploading when no CRUD transaction is queued", async () => {
		const { connector, sessionGetToken } = createConnector();
		const database = createDatabase(null);

		await connector.uploadData(database);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(sessionGetToken).not.toHaveBeenCalled();
	});

	it("maps PATCH and DELETE CRUD entries to the upload batch", async () => {
		const { connector } = createConnector();
		const tx = createTransaction({
			crud: [
				{
					op: UpdateType.PATCH,
					table: "items",
					id: "itm_patch",
					opData: { name: "Oat milk" },
				},
				{
					op: UpdateType.DELETE,
					table: "item_checks",
					id: "chk_delete",
					opData: { updated_at: "2026-06-21T01:00:00.000Z" },
				},
			],
		});
		fetchMock.mockResolvedValue(responseWithStatus(200));

		await connector.uploadData(createDatabase(tx));

		expectFetchBody({
			batch: [
				{
					op: "PATCH",
					table: "items",
					id: "itm_patch",
					data: { name: "Oat milk" },
				},
				{
					op: "DELETE",
					table: "item_checks",
					id: "chk_delete",
					data: { updated_at: "2026-06-21T01:00:00.000Z" },
				},
			],
		});
	});
});

function createConnector(options?: {
	powersyncToken?: string | null;
	sessionToken?: string | null;
}) {
	const powersyncGetToken = tokenGetter(
		options?.powersyncToken === undefined
			? "powersync-token"
			: options.powersyncToken,
	);
	const sessionGetToken = tokenGetter(
		options?.sessionToken === undefined
			? "session-token"
			: options.sessionToken,
	);
	const deps: PowerSyncConnectorDeps = {
		powersyncGetToken,
		sessionGetToken,
		apiBaseUrl: () => "https://api.test",
		powersyncUrl: "https://sync.test",
	};

	return {
		connector: new PowerSyncConnector(deps),
		powersyncGetToken,
		sessionGetToken,
	};
}

function tokenGetter(token: string | null): TokenGetterMock {
	return jest.fn<Promise<string | null>, []>().mockResolvedValue(token);
}

function createTransaction(
	overrides?: Partial<UploadTransaction>,
): UploadTransaction {
	return {
		crud: [
			{
				op: UpdateType.PUT,
				table: "items",
				id: "itm_x",
				opData: { name: "Milk", updated_at: "2026-06-21T00:00:00.000Z" },
			},
		],
		complete: jest.fn<Promise<void>, []>(async () => undefined),
		...overrides,
	};
}

function createDatabase(tx: UploadTransaction | null): PowerSyncUploadDatabase {
	return {
		getNextCrudTransaction: jest
			.fn<ReturnType<PowerSyncUploadDatabase["getNextCrudTransaction"]>, []>()
			.mockResolvedValue(tx),
	};
}

function responseWithStatus(status: number): Response {
	return new Response(null, { status });
}

function expectFetchAuthorization(expected: string): void {
	const init = fetchMockInit();
	expect(init.headers).toMatchObject({ Authorization: expected });
}

function expectFetchBody(expected: unknown): void {
	const init = fetchMockInit();
	expect(JSON.parse(String(init.body))).toEqual(expected);
}

function fetchMockInit(): RequestInit {
	const init = globalFetchMock().mock.calls[0]?.[1];
	if (!init) {
		throw new Error("Expected fetch to be called with init options");
	}
	return init;
}

function globalFetchMock(): FetchMock {
	if (!activeFetchMock) {
		throw new Error("Expected global.fetch to be mocked");
	}
	return activeFetchMock;
}

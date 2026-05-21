import { itemChecks, lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import type { HouseholdSqlStatement } from "@/lib/services/household/household-store";

import { createHouseholdActiveListDataSource } from "./active-list-data-source";

const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLogger = {
	error: mockLoggerError,
	warn: mockLoggerWarn,
};

jest.mock("@/lib/logger", () => ({
	logger: {
		with: jest.fn(() => mockLogger),
	},
}));

describe("createHouseholdActiveListDataSource", () => {
	beforeEach(() => {
		mockLoggerError.mockReset();
		mockLoggerWarn.mockReset();
	});

	it("exposes explicit app-owned pull and sync operations", async () => {
		const pull = jest.fn(async () => ({ changed: true }));
		const sync = jest.fn(async () => ({ changed: false }));
		const remoteExecute = jest.fn(async () => undefined);
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute: jest.fn(async () => ({ rows: [] })),
					pull,
					sync,
					close: jest.fn(async () => undefined),
				},
				openRemoteClient: () => ({ execute: remoteExecute }),
			},
		);

		expect(dataSource.syncAuthorized).toBe(true);
		await expect(dataSource.pull()).resolves.toEqual({ changed: true });
		await expect(dataSource.sync()).resolves.toEqual({ changed: false });
		expect(pull).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it("pushes local rows through the remote upsert path after native sync succeeds", async () => {
		const remoteExecute = jest.fn(async () => undefined);
		const nativeSync = jest.fn(async () => ({ changed: true }));
		const execute = jest.fn(async (statement: HouseholdSqlStatement) => {
			const sql = statementSql(statement);
			if (sql.includes("FROM lists")) {
				return {
					rows: [
						{
							id: DEFAULT_LIST_ID,
							name: DEFAULT_LIST_NAME,
							created_by_user_id: "usr_avery",
							created_at: 1,
							updated_at: 1,
							deleted_at: null,
						},
					],
				};
			}
			if (sql.includes("FROM items")) {
				return {
					rows: [
						{
							id: "itm_local",
							list_id: DEFAULT_LIST_ID,
							name: "Local Milk",
							notes: null,
							position: 0,
							created_by_user_id: "usr_avery",
							created_at: 2,
							updated_at: 2,
							deleted_at: null,
						},
					],
				};
			}
			return { rows: [] };
		});
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute,
					sync: nativeSync,
					pull: jest.fn(async () => ({ changed: false })),
					close: jest.fn(async () => undefined),
				},
				openRemoteClient: () => ({ execute: remoteExecute }),
			},
		);

		await expect(dataSource.sync()).resolves.toEqual({ changed: true });

		expect(nativeSync).toHaveBeenCalledTimes(1);
		expect(remoteExecute).toHaveBeenCalledWith(
			expect.objectContaining({
				sql: expect.stringContaining("INSERT INTO items"),
				args: [
					"itm_local",
					DEFAULT_LIST_ID,
					"Local Milk",
					null,
					0,
					"usr_avery",
					2,
					2,
					null,
				],
			}),
		);
		expect(nativeSync.mock.invocationCallOrder[0]).toBeLessThan(
			remoteExecute.mock.invocationCallOrder[0],
		);
		expect(mockLoggerWarn).not.toHaveBeenCalledWith(
			"active list sync fallback succeeded",
		);
	});

	it("falls back to remote LWW upserts when native sync cannot push", async () => {
		const remoteExecute = jest.fn(async () => undefined);
		const nativeError = new Error("native sync failed");
		const execute = jest.fn(async (statement: HouseholdSqlStatement) => {
			const sql = statementSql(statement);
			if (sql.includes("FROM lists")) {
				return {
					rows: [
						{
							id: DEFAULT_LIST_ID,
							name: DEFAULT_LIST_NAME,
							created_by_user_id: "usr_avery",
							created_at: 1,
							updated_at: 1,
							deleted_at: null,
						},
					],
				};
			}
			if (sql.includes("FROM items")) {
				return {
					rows: [
						{
							id: "itm_offline",
							list_id: DEFAULT_LIST_ID,
							name: "Offline Milk",
							notes: null,
							position: 0,
							created_by_user_id: "usr_avery",
							created_at: 2,
							updated_at: 2,
							deleted_at: null,
						},
					],
				};
			}
			if (sql.includes("FROM item_checks")) {
				return {
					rows: [
						{
							item_id: "itm_offline",
							user_id: "usr_avery",
							checked_at: 3,
							updated_at: 3,
						},
					],
				};
			}

			return { rows: [] };
		});
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute,
					sync: jest.fn(async () => {
						throw nativeError;
					}),
					pull: jest.fn(async () => ({ changed: false })),
					close: jest.fn(async () => undefined),
				},
				openRemoteClient: () => ({ execute: remoteExecute }),
			},
		);

		await expect(dataSource.sync()).resolves.toEqual({
			changed: false,
			recoveredNativeSyncError: nativeError,
		});

		expect(remoteExecute).toHaveBeenCalledTimes(3);
		expect(remoteExecute).toHaveBeenCalledWith(
			expect.objectContaining({
				sql: expect.stringContaining("INSERT INTO items"),
				args: [
					"itm_offline",
					DEFAULT_LIST_ID,
					"Offline Milk",
					null,
					0,
					"usr_avery",
					2,
					2,
					null,
				],
			}),
		);
		expect(remoteExecute).toHaveBeenCalledWith(
			expect.objectContaining({
				sql: expect.stringContaining(
					"WHERE excluded.updated_at >= items.updated_at",
				),
			}),
		);
		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it("pushes local rows without native sync for automatic retry paths", async () => {
		const remoteExecute = jest.fn(async () => undefined);
		const nativeSync = jest.fn(async () => ({ changed: false }));
		const execute = jest.fn(async (statement: HouseholdSqlStatement) => {
			const sql = statementSql(statement);
			if (sql.includes("FROM items")) {
				return {
					rows: [
						{
							id: "itm_retry",
							list_id: DEFAULT_LIST_ID,
							name: "Retry Milk",
							notes: null,
							position: 0,
							created_by_user_id: "usr_avery",
							created_at: 2,
							updated_at: 2,
							deleted_at: null,
						},
					],
				};
			}
			return { rows: [] };
		});
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute,
					sync: nativeSync,
					pull: jest.fn(async () => ({ changed: false })),
					close: jest.fn(async () => undefined),
				},
				openRemoteClient: () => ({ execute: remoteExecute }),
			},
		);

		await expect(dataSource.sync({ mode: "pushLocalOnly" })).resolves.toEqual({
			changed: false,
		});

		expect(nativeSync).not.toHaveBeenCalled();
		expect(remoteExecute).toHaveBeenCalledWith(
			expect.objectContaining({
				sql: expect.stringContaining("INSERT INTO items"),
				args: [
					"itm_retry",
					DEFAULT_LIST_ID,
					"Retry Milk",
					null,
					0,
					"usr_avery",
					2,
					2,
					null,
				],
			}),
		);
	});

	it("rethrows when native sync and fallback both fail without logging at the data-source boundary", async () => {
		const nativeError = new Error("native sync failed");
		const fallbackError = new Error("remote unavailable");
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute: jest.fn(async () => ({ rows: [] })),
					sync: jest.fn(async () => {
						throw nativeError;
					}),
					pull: jest.fn(async () => ({ changed: false })),
					close: jest.fn(async () => undefined),
				},
				openRemoteClient: () => {
					throw fallbackError;
				},
			},
		);

		const syncAttempt = dataSource.sync();
		await expect(syncAttempt).rejects.toThrow(fallbackError);
		await expect(syncAttempt).rejects.toMatchObject({
			nativeSyncError: nativeError,
		});

		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it("does not error-log expected network failures while offline", async () => {
		const networkError = new TypeError("Network request failed");
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute: jest.fn(async () => ({ rows: [] })),
					sync: jest.fn(async () => {
						throw networkError;
					}),
					pull: jest.fn(async () => ({ changed: false })),
					close: jest.fn(async () => undefined),
				},
				openRemoteClient: () => {
					throw networkError;
				},
			},
		);

		await expect(dataSource.sync()).rejects.toThrow(networkError);

		expect(mockLoggerError).not.toHaveBeenCalled();
		expect(mockLoggerWarn).not.toHaveBeenCalledWith(
			"active list sync fallback succeeded",
		);
	});

	it("resolves Item creation after local commit without starting sync", async () => {
		const execute = jest.fn(async (statement: HouseholdSqlStatement) => {
			const sql = statementSql(statement);
			return sql.includes("MAX(position)")
				? { rows: [{ position: 0 }] }
				: { rows: [] };
		});
		const sync = jest.fn(async () => ({ changed: false }));
		const dataSource = createHouseholdActiveListDataSource(
			dataSourceConfigFixture(),
			{
				store: {
					syncAuthorized: true,
					execute,
					pull: jest.fn(async () => ({ changed: false })),
					sync,
					close: jest.fn(async () => undefined),
				},
			},
		);

		await expect(dataSource.addItem("Milk")).resolves.toMatchObject({
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		});
		await Promise.resolve();

		expect(sync).not.toHaveBeenCalled();
		expect(mockLoggerWarn).not.toHaveBeenCalled();
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it("resolves checked-state updates after local commit without starting sync", async () => {
		const household = await createTestHouseholdDb();
		const sync = jest.fn(async () => ({ changed: false }));

		try {
			await household.db.insert(lists).values({
				id: DEFAULT_LIST_ID,
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});
			const dataSource = createHouseholdActiveListDataSource(
				dataSourceConfigFixture(),
				{
					store: {
						syncAuthorized: true,
						execute: household.client.execute.bind(household.client),
						pull: jest.fn(async () => ({ changed: false })),
						sync,
						close: jest.fn(async () => undefined),
					},
				},
			);
			const milk = await dataSource.addItem("Milk");
			await Promise.resolve();
			sync.mockClear();
			mockLoggerWarn.mockClear();

			await expect(dataSource.setItemChecked(milk.id, true)).resolves.toBe(
				undefined,
			);
			await Promise.resolve();

			const checkRow = await household.db.query.itemChecks.findFirst({
				where: (table, { eq }) => eq(table.itemId, milk.id),
			});
			expect(checkRow).toMatchObject({
				itemId: milk.id,
				userId: "usr_avery",
				checkedAt: expect.any(Number),
				updatedAt: expect.any(Number),
			});
			expect(sync).not.toHaveBeenCalled();
			expect(mockLoggerWarn).not.toHaveBeenCalled();
		} finally {
			await household.close();
		}
	});

	it("loads, appends, and persists latest-check-wins Item state", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values({
				id: DEFAULT_LIST_ID,
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});

			const dataSource = createHouseholdActiveListDataSource(
				{
					household: { id: "hh_avery", name: "Avery" },
					activeMember: {
						id: "mbr_avery",
						userId: "usr_avery",
						role: "owner",
						displayName: "Avery Chen",
					},
					list: { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME },
					currentUser: {
						id: "usr_avery",
						email: "avery@example.com",
						displayName: "Avery Chen",
					},
					members: [
						{
							membershipId: "mbr_avery",
							userId: "usr_avery",
							role: "owner",
							displayName: "Avery Chen",
						},
						{
							membershipId: "mbr_blake",
							userId: "usr_blake",
							role: "member",
							displayName: "Blake",
						},
					],
					database: {
						url: `file:${household.path}`,
						authToken: "unused",
						expiresAt: 1_700_000_000_001,
					},
				},
				{
					store: {
						execute: household.client.execute.bind(household.client),
						close: jest.fn(async () => undefined),
					},
				},
			);

			const milk = await dataSource.addItem("Milk");
			const eggs = await dataSource.addItem("Eggs");

			expect(await dataSource.load()).toEqual({
				householdName: "Avery",
				listName: "Weekend Groceries",
				items: [
					{
						id: milk.id,
						name: "Milk",
						checked: false,
						checkedByMemberName: null,
					},
					{
						id: eggs.id,
						name: "Eggs",
						checked: false,
						checkedByMemberName: null,
					},
				],
			});

			await dataSource.setItemChecked(milk.id, true);
			expect((await dataSource.load()).items[0]).toEqual({
				id: milk.id,
				name: "Milk",
				checked: true,
				checkedByMemberName: "Avery Chen",
			});

			await household.db.insert(itemChecks).values({
				itemId: milk.id,
				userId: "usr_blake",
				checkedAt: null,
				updatedAt: Number.MAX_SAFE_INTEGER,
			});

			expect((await dataSource.load()).items[0]).toEqual({
				id: milk.id,
				name: "Milk",
				checked: false,
				checkedByMemberName: null,
			});
		} finally {
			await household.close();
		}
	});
});

function dataSourceConfigFixture() {
	return {
		household: { id: "hh_avery", name: "Avery" },
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner" as const,
			displayName: "Avery Chen",
		},
		list: { id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME },
		currentUser: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner" as const,
				displayName: "Avery Chen",
			},
		],
		database: {
			url: "libsql://example.turso.io",
			authToken: "token",
			expiresAt: 1,
		},
	};
}

function statementSql(statement: HouseholdSqlStatement | undefined): string {
	if (!statement) return "";
	return typeof statement === "string" ? statement : statement.sql;
}

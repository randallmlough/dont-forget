import { itemChecks, lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME } from "@/lib/bootstrap";
import type { HouseholdSqlStatement } from "@/lib/services/household/household-store";

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

describe("createHouseholdActiveListAdapter", () => {
	beforeEach(() => {
		mockLoggerError.mockReset();
		mockLoggerWarn.mockReset();
	});

	it("exposes explicit app-owned pull and sync operations", async () => {
		const pull = jest.fn(async () => ({ changed: true }));
		const sync = jest.fn(async () => ({ changed: false }));
		const adapter = createHouseholdActiveListAdapter(adapterConfigFixture(), {
			store: {
				syncAuthorized: true,
				execute: jest.fn(async () => ({ rows: [] })),
				pull,
				sync,
				close: jest.fn(async () => undefined),
			},
		});

		expect(adapter.syncAuthorized).toBe(true);
		await expect(adapter.pull()).resolves.toEqual({ changed: true });
		await expect(adapter.sync()).resolves.toEqual({ changed: false });
		expect(pull).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledTimes(1);
	});

	it("falls back to remote LWW upserts when native sync cannot push", async () => {
		const remoteExecute = jest.fn(async () => undefined);
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
		const adapter = createHouseholdActiveListAdapter(adapterConfigFixture(), {
			store: {
				syncAuthorized: true,
				execute,
				sync: jest.fn(async () => {
					throw new Error("native sync failed");
				}),
				pull: jest.fn(async () => ({ changed: false })),
				close: jest.fn(async () => undefined),
			},
			openRemoteClient: () => ({ execute: remoteExecute }),
		});

		await expect(adapter.sync()).resolves.toEqual({ changed: false });

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
		expect(mockLoggerError).toHaveBeenCalledWith(
			"active list native sync failed",
			{ error: expect.any(Error) },
		);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"active list sync fallback succeeded",
		);
	});

	it("logs and rethrows when native sync and fallback both fail", async () => {
		const fallbackError = new Error("remote unavailable");
		const adapter = createHouseholdActiveListAdapter(adapterConfigFixture(), {
			store: {
				syncAuthorized: true,
				execute: jest.fn(async () => ({ rows: [] })),
				sync: jest.fn(async () => {
					throw new Error("native sync failed");
				}),
				pull: jest.fn(async () => ({ changed: false })),
				close: jest.fn(async () => undefined),
			},
			openRemoteClient: () => {
				throw fallbackError;
			},
		});

		await expect(adapter.sync()).rejects.toThrow(fallbackError);

		expect(mockLoggerError).toHaveBeenCalledWith(
			"active list native sync failed",
			{ error: expect.any(Error) },
		);
		expect(mockLoggerError).toHaveBeenCalledWith(
			"active list sync fallback failed",
			{ error: fallbackError },
		);
	});

	it("uses monotonic app-generated timestamps for local Item writes", async () => {
		let uuid = 0;
		const rawTimestamps = [
			1_700_000_000_000, 1_699_999_999_999, 1_699_999_999_999,
		];
		const execute = jest.fn(async (statement: HouseholdSqlStatement) => {
			const sql = statementSql(statement);
			return sql.includes("MAX(position)")
				? { rows: [{ position: 0 }] }
				: { rows: [] };
		});
		const adapter = createHouseholdActiveListAdapter(adapterConfigFixture(), {
			store: {
				execute,
				close: jest.fn(async () => undefined),
			},
			now: () => rawTimestamps.shift() ?? 1_699_999_999_999,
			randomUuid: () => `uuid-${++uuid}`,
		});

		const milk = await adapter.addItem("Milk");
		await adapter.addItem("Eggs");
		await adapter.setItemChecked(milk.id, true);

		const itemWrites = execute.mock.calls
			.map(([statement]) => statement)
			.filter((statement) =>
				statementSql(statement).includes("INSERT INTO items"),
			);
		const checkWrite = execute.mock.calls
			.map(([statement]) => statement)
			.find((statement) =>
				statementSql(statement).includes("INSERT INTO item_checks"),
			);

		expect(statementArgs(itemWrites[0]).slice(-2)).toEqual([
			1_700_000_000_000, 1_700_000_000_000,
		]);
		expect(statementArgs(itemWrites[1]).slice(-2)).toEqual([
			1_700_000_000_001, 1_700_000_000_001,
		]);
		expect(statementArgs(checkWrite)).toEqual([
			milk.id,
			"usr_avery",
			1_700_000_000_002,
			1_700_000_000_002,
		]);
	});

	it("loads, appends, and persists latest-check-wins Item state", async () => {
		const household = await createTestHouseholdDb();
		let uuid = 0;
		let now = 1_700_000_000_000;

		try {
			await household.db.insert(lists).values({
				id: DEFAULT_LIST_ID,
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});

			const adapter = createHouseholdActiveListAdapter(
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
						expiresAt: now + 1,
					},
				},
				{
					store: {
						execute: household.client.execute.bind(household.client),
						close: jest.fn(async () => undefined),
					},
					now: () => now++,
					randomUuid: () => `uuid-${++uuid}`,
				},
			);

			const milk = await adapter.addItem("Milk");
			const eggs = await adapter.addItem("Eggs");

			expect(await adapter.load()).toEqual({
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

			await adapter.setItemChecked(milk.id, true);
			expect((await adapter.load()).items[0]).toEqual({
				id: milk.id,
				name: "Milk",
				checked: true,
				checkedByMemberName: "Avery Chen",
			});

			await household.db.insert(itemChecks).values({
				itemId: milk.id,
				userId: "usr_blake",
				checkedAt: null,
				updatedAt: now + 100,
			});

			expect((await adapter.load()).items[0]).toEqual({
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

function adapterConfigFixture() {
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

function statementArgs(statement: HouseholdSqlStatement | undefined) {
	if (!statement || typeof statement === "string") return [];
	return statement.args ?? [];
}

import type {
	ProductDataExecutor,
	ProductDataRow,
	ProductDataStore,
	ProductDataWriteResult,
} from "@/lib/services/shared/product-data-store";
import { createListService } from "./list-service";

describe("createListService", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("creates Lists with the active Household id through a write transaction", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_780_000_000_000);
		const store = productStoreFixture({
			writeResult: { rowsAffected: 0, rows: [{ id: "lst_new" }] },
		});
		const service = createListService({
			householdId: "hh_1",
			userId: "usr_avery",
			store,
		});

		const result = await service.createList({ name: "  Groceries  " });

		expect(result).toMatchObject({
			status: "available",
			didWrite: true,
			list: {
				householdId: "hh_1",
				name: "Groceries",
				createdByUserId: "usr_avery",
			},
		});
		expect(store.writeTransaction).toHaveBeenCalledTimes(1);
		expect(firstSql(store)).toContain("INSERT INTO lists");
		expect(firstSql(store)).toContain("household_id");
		expect(store.lastTransaction.execute).toHaveBeenCalledWith(
			expect.any(String),
			expect.arrayContaining(["hh_1", "Groceries", "usr_avery"]),
		);
	});

	it("summarizes Lists using the shared item_checks row", async () => {
		const store = productStoreFixture({
			getAllRows: [
				{
					id: "lst_groceries",
					name: "Groceries",
					created_by_user_id: "usr_avery",
					created_at: "2026-06-01T09:00:00.000Z",
					updated_at: "2026-06-01T09:00:00.000Z",
					archived_at: null,
					last_activity_at: "2026-06-01T10:00:00.000Z",
					unchecked_item_count: 2,
					checked_item_count: 1,
				},
			],
		});
		const service = createListService({
			householdId: "hh_1",
			userId: "usr_avery",
			store,
		});

		await expect(service.listLists()).resolves.toEqual([
			{
				id: "lst_groceries",
				householdId: "hh_1",
				name: "Groceries",
				createdByUserId: "usr_avery",
				createdAt: Date.parse("2026-06-01T09:00:00.000Z"),
				updatedAt: Date.parse("2026-06-01T09:00:00.000Z"),
				archived: false,
				archivedAt: null,
				lastActivityAt: Date.parse("2026-06-01T10:00:00.000Z"),
				uncheckedItemCount: 2,
				checkedItemCount: 1,
			},
		]);
		expect(store.getAllMock).toHaveBeenCalledWith(
			expect.stringContaining("LEFT JOIN item_checks"),
			["1970-01-01T00:00:00.000Z", "1970-01-01T00:00:00.000Z", "hh_1"],
		);
	});

	it("reports a lost rename race as a deleted List", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_780_000_000_000);
		const store = productStoreFixture({
			getOptionalRows: [
				{
					id: "lst_groceries",
					name: "Groceries",
					created_by_user_id: "usr_avery",
					created_at: "2026-06-01T09:00:00.000Z",
					updated_at: "2026-06-01T09:00:00.000Z",
					archived_at: null,
					deleted_at: null,
				},
				{
					id: "lst_groceries",
					name: "Groceries",
					created_by_user_id: "usr_avery",
					created_at: "2026-06-01T09:00:00.000Z",
					updated_at: "2026-06-01T10:00:00.000Z",
					archived_at: null,
					deleted_at: "2026-06-01T10:00:00.000Z",
				},
			],
			writeResult: { rowsAffected: 0, rows: [] },
		});
		const service = createListService({
			householdId: "hh_1",
			userId: "usr_avery",
			store,
		});

		await expect(
			service.renameList({ listId: "lst_groceries", name: "Market" }),
		).resolves.toEqual({
			status: "deleted",
			listId: "lst_groceries",
			deletedAt: Date.parse("2026-06-01T10:00:00.000Z"),
			updatedAt: Date.parse("2026-06-01T10:00:00.000Z"),
			didWrite: false,
		});
	});
});

type ProductStoreFixture = ProductDataStore & {
	getAllMock: jest.Mock<
		Promise<ProductDataRow[]>,
		[sql: string, parameters?: readonly unknown[]]
	>;
	lastTransaction: jest.Mocked<Pick<ProductDataExecutor, "execute">> &
		Pick<ProductDataExecutor, "getAll" | "getOptional">;
};

function productStoreFixture(options: {
	getAllRows?: ProductDataRow[];
	getOptionalRows?: ProductDataRow[];
	writeResult?: ProductDataWriteResult;
}): ProductStoreFixture {
	const optionalRows = [...(options.getOptionalRows ?? [])];
	const getAllMock = jest.fn(
		async (_sql: string, _parameters?: readonly unknown[]) =>
			options.getAllRows ?? [],
	);
	const transaction: ProductStoreFixture["lastTransaction"] = {
		execute: jest.fn(
			async (_sql: string, _parameters?: readonly unknown[]) =>
				options.writeResult ?? { rowsAffected: 0, rows: [] },
		),
		async getAll<Row extends ProductDataRow = ProductDataRow>(
			sql: string,
			parameters?: readonly unknown[],
		): Promise<Row[]> {
			return (await getAllMock(sql, parameters)) as Row[];
		},
		async getOptional<Row extends ProductDataRow = ProductDataRow>(
			_sql: string,
			_parameters?: readonly unknown[],
		): Promise<Row | null> {
			return (optionalRows.shift() ?? null) as Row | null;
		},
	};

	return {
		...transaction,
		writeTransaction: jest.fn((run) => run(transaction)),
		changes: { subscribe: jest.fn(() => ({ remove() {} })) },
		getAllMock,
		lastTransaction: transaction,
	};
}

function firstSql(store: ProductStoreFixture): string {
	return store.lastTransaction.execute.mock.calls[0][0];
}

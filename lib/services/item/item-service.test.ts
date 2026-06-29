import type {
	ProductDataExecutor,
	ProductDataRow,
	ProductDataStore,
	ProductDataWriteResult,
} from "@/lib/services/shared/product-data-store";
import { createItemService } from "./item-service";

describe("createItemService", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("lists Items with shared checked-state attribution", async () => {
		const store = productStoreFixture({
			getAllRows: [
				{
					id: "itm_milk",
					list_id: "lst_groceries",
					name: "Milk",
					quantity: "1",
					notes: null,
					checked_by_user_id: "usr_avery",
					checked_at: "2026-06-01T10:00:00.000Z",
					position: 0,
					created_by_user_id: "usr_river",
					created_at: "2026-06-01T09:00:00.000Z",
					updated_at: "2026-06-01T10:00:00.000Z",
				},
			],
		});
		const service = createItemService({
			householdId: "hh_1",
			store,
		});

		await expect(
			service.listItems({ listId: "lst_groceries" }),
		).resolves.toEqual([
			{
				id: "itm_milk",
				householdId: "hh_1",
				listId: "lst_groceries",
				name: "Milk",
				quantity: "1",
				notes: null,
				checked: true,
				checkedByUserId: "usr_avery",
				position: 0,
				createdByUserId: "usr_river",
				createdAt: Date.parse("2026-06-01T09:00:00.000Z"),
				updatedAt: Date.parse("2026-06-01T10:00:00.000Z"),
			},
		]);
		expect(store.getAllMock).toHaveBeenCalledWith(
			expect.stringContaining("LEFT JOIN item_checks"),
			["hh_1", "lst_groceries"],
		);
	});

	it("adds an Item through a PowerSync write transaction", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_780_000_000_000);
		const store = productStoreFixture({
			writeResult: { rowsAffected: 0, rows: [{ position: 3 }] },
		});
		const service = createItemService({
			householdId: "hh_1",
			store,
		});

		const item = await service.addItem({
			listId: "lst_groceries",
			userId: "usr_avery",
			name: "  Milk  ",
			quantity: "  1 gallon ",
			notes: " ",
		});

		expect(item).toMatchObject({
			householdId: "hh_1",
			listId: "lst_groceries",
			name: "Milk",
			quantity: "1 gallon",
			notes: null,
			position: 3,
			createdByUserId: "usr_avery",
		});
		expect(store.writeTransaction).toHaveBeenCalledTimes(1);
		expect(store.lastTransaction.execute).toHaveBeenCalledWith(
			expect.stringContaining("INSERT INTO items"),
			expect.arrayContaining(["Milk", "1 gallon", null, "usr_avery"]),
		);
		expect(firstSql(store)).toContain("l.household_id = ?");
	});

	it("persists uncheck as a shared item_check row with attribution", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_780_000_000_001);
		const store = productStoreFixture({
			writeResult: { rowsAffected: 0, rows: [{ id: "chk_milk" }] },
		});
		const service = createItemService({
			householdId: "hh_1",
			store,
		});

		await service.setItemChecked({
			listId: "lst_groceries",
			itemId: "itm_milk",
			userId: "usr_avery",
			checked: false,
		});

		expect(store.writeTransaction).toHaveBeenCalledTimes(1);
		const [, args] = store.lastTransaction.execute.mock.calls[0];
		expect(firstSql(store)).toContain("INSERT INTO item_checks");
		expect(args).toEqual([
			null,
			"usr_avery",
			"2026-05-28T20:26:40.001Z",
			"itm_milk",
			"lst_groceries",
			"hh_1",
		]);
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
	writeResult?: ProductDataWriteResult;
}): ProductStoreFixture {
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
			return null;
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

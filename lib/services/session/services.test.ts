import type { HouseholdSqlStatement } from "@/lib/services/household/household-store";
import { createSessionDataServices } from "./services";

const logger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
};

describe("createSessionDataServices", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logger.with.mockReturnValue(logger);
	});

	it("loads List and Item data through explicit listId service calls", async () => {
		const store = storeFixture();
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(
			services.lists.getList({ listId: "lst_default_groceries" }),
		).resolves.toMatchObject({
			id: "lst_default_groceries",
			name: "Groceries",
		});
		await expect(
			services.items.listItems({ listId: "lst_default_groceries" }),
		).resolves.toEqual([
			expect.objectContaining({
				id: "itm_milk",
				listId: "lst_default_groceries",
				name: "Milk",
			}),
		]);

		expect(store.execute).toHaveBeenCalledWith(
			expect.objectContaining({ args: ["lst_default_groceries"] }),
		);
	});

	it("uses explicit listId for Item writes", async () => {
		const store = storeFixture();
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await services.items.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Eggs",
		});
		await services.items.setItemChecked({
			listId: "lst_default_groceries",
			itemId: "itm_milk",
			userId: "usr_avery",
			checked: true,
		});

		expect(store.execute).toHaveBeenCalledWith(
			expect.objectContaining({ args: ["lst_default_groceries"] }),
		);
		expect(store.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				args: expect.arrayContaining(["lst_default_groceries", "Eggs"]),
			}),
		);
	});
});

function storeFixture() {
	return {
		syncAuthorized: true,
		execute: jest.fn(async (statement: HouseholdSqlStatement) => {
			const sql = typeof statement === "string" ? statement : statement.sql;
			const args = typeof statement === "string" ? [] : statement.args;
			if (sql.includes("FROM lists")) {
				return {
					rows: [
						{
							id: args?.[0],
							name: "Groceries",
							created_by_user_id: "usr_avery",
							created_at: 1,
							updated_at: 1,
						},
					],
				};
			}
			if (sql.includes("COALESCE(MAX(position)")) {
				return { rows: [{ position: 1 }] };
			}
			if (sql.includes("FROM items")) {
				return {
					rows: [
						{
							id: "itm_milk",
							list_id: args?.[0],
							name: "Milk",
							checked_by_user_id: null,
							checked_at: null,
							position: 0,
							created_by_user_id: "usr_avery",
							created_at: 1,
							updated_at: 1,
						},
					],
				};
			}
			return { rows: [] };
		}),
		pull: jest.fn(async () => ({ changed: false })),
		push: jest.fn(async () => undefined),
		sync: jest.fn(async () => ({ changed: false })),
		close: jest.fn(async () => undefined),
	};
}

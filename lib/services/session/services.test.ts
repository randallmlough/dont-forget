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
			expect.objectContaining({
				args: expect.arrayContaining(["lst_default_groceries", "Eggs"]),
			}),
		);
	});

	it("reports ready only after the HouseholdStore opens", async () => {
		const store = storeFixture();
		const openStore = jest.fn(async () => store);
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ openStore },
		);

		await expect(services.ready).resolves.toBeUndefined();
		expect(openStore).toHaveBeenCalledWith({
			householdId: "hh_avery",
			database: { url: "libsql://example", authToken: "secret" },
		});
	});

	it("uses native sync result for full sync", async () => {
		const store = storeFixture();
		store.sync.mockResolvedValueOnce({ changed: true });
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(services.sync()).resolves.toEqual({ changed: true });

		expect(store.sync).toHaveBeenCalledTimes(1);
	});

	it("uses native push only for pushLocalOnly sync when native push succeeds", async () => {
		const store = storeFixture();
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(services.sync({ mode: "pushLocalOnly" })).resolves.toEqual({
			changed: false,
		});

		expect(store.push).toHaveBeenCalledTimes(1);
		expect(store.sync).not.toHaveBeenCalled();
	});

	it("propagates native sync failures", async () => {
		const store = storeFixture();
		const networkError = new TypeError("Network request failed");
		store.sync.mockRejectedValueOnce(networkError);
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(services.sync()).rejects.toBe(networkError);
	});

	it("does not run native sync when the session is not authorized for sync", async () => {
		const store = storeFixture({ syncAuthorized: false });
		const services = createSessionDataServices(
			{
				householdId: "hh_avery",
				database: { url: "libsql://example" },
				logger,
			},
			{ store },
		);

		await expect(services.sync()).resolves.toEqual({ changed: false });
		expect(store.sync).not.toHaveBeenCalled();
		expect(store.push).not.toHaveBeenCalled();
	});
});

function storeFixture(overrides: { syncAuthorized?: boolean } = {}) {
	return {
		syncAuthorized: overrides.syncAuthorized ?? true,
		execute: jest.fn(async (statement: HouseholdSqlStatement) => {
			const { sql, args = [] } = statement;
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

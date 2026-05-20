import { itemChecks, items, lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import type { Logger } from "@/lib/logger";

import { createItemService } from "./item-service";

jest.mock("@/lib/analytics", () => ({
	track: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
	logger: {
		with: jest.fn(() => ({
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			with: jest.fn(),
		})),
	},
}));

const testLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
} satisfies jest.Mocked<Logger>;
testLogger.with.mockImplementation(() => testLogger);

beforeEach(() => {
	jest.restoreAllMocks();
	testLogger.debug.mockReset();
	testLogger.info.mockReset();
	testLogger.warn.mockReset();
	testLogger.error.mockReset();
	testLogger.with.mockClear();
});

describe("createItemService", () => {
	it("lists Items in stable order with latest per-User checked state", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values({
				id: "lst_weekend",
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});
			await household.db.insert(items).values([
				{
					id: "itm_b",
					listId: "lst_weekend",
					name: "Bananas",
					position: 1,
					createdByUserId: "usr_avery",
					createdAt: 20,
					updatedAt: 20,
				},
				{
					id: "itm_a",
					listId: "lst_weekend",
					name: "Apples",
					position: 1,
					createdByUserId: "usr_avery",
					createdAt: 10,
					updatedAt: 10,
				},
				{
					id: "itm_c",
					listId: "lst_weekend",
					name: "Coffee",
					position: 2,
					createdByUserId: "usr_avery",
					createdAt: 30,
					updatedAt: 30,
				},
				{
					id: "itm_deleted",
					listId: "lst_weekend",
					name: "Deleted",
					position: 0,
					createdByUserId: "usr_avery",
					createdAt: 1,
					updatedAt: 1,
					deletedAt: 2,
				},
			]);
			await household.db.insert(itemChecks).values([
				{
					itemId: "itm_a",
					userId: "usr_blake",
					checkedAt: 40,
					updatedAt: 40,
				},
				{
					itemId: "itm_a",
					userId: "usr_avery",
					checkedAt: null,
					updatedAt: 50,
				},
				{
					itemId: "itm_b",
					userId: "usr_blake",
					checkedAt: 60,
					updatedAt: 60,
				},
			]);
			const service = createItemService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.listItems({ listId: "lst_weekend" }),
			).resolves.toEqual([
				expect.objectContaining({
					id: "itm_a",
					householdId: "hh_avery",
					listId: "lst_weekend",
					name: "Apples",
					checked: false,
					checkedByUserId: null,
					position: 1,
				}),
				expect.objectContaining({
					id: "itm_b",
					name: "Bananas",
					checked: true,
					checkedByUserId: "usr_blake",
					position: 1,
				}),
				expect.objectContaining({
					id: "itm_c",
					name: "Coffee",
					checked: false,
					checkedByUserId: null,
					position: 2,
				}),
			]);
		} finally {
			await household.close();
		}
	});

	it("adds a trimmed Item with generated ID and controlled timestamps", async () => {
		const household = await createTestHouseholdDb();
		const analytics = analyticsFixture();
		jest.spyOn(Date, "now").mockReturnValue(8_000_000_000_000);

		try {
			await household.db.insert(lists).values({
				id: "lst_weekend",
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});
			const service = createItemService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
				analytics,
			});

			const item = await service.addItem({
				listId: "lst_weekend",
				userId: "usr_avery",
				name: "  Milk  ",
			});
			const row = await household.db.query.items.findFirst({
				where: (table, { eq }) => eq(table.id, item.id),
			});

			expect(item.id).toMatch(/^itm_[0-9a-f-]+$/);
			expect(item).toEqual({
				id: item.id,
				householdId: "hh_avery",
				listId: "lst_weekend",
				name: "Milk",
				checked: false,
				checkedByUserId: null,
				position: 0,
				createdByUserId: "usr_avery",
				createdAt: 8_000_000_000_000,
				updatedAt: 8_000_000_000_000,
			});
			expect(row).toMatchObject({
				id: item.id,
				listId: "lst_weekend",
				name: "Milk",
				position: 0,
				createdByUserId: "usr_avery",
				createdAt: 8_000_000_000_000,
				updatedAt: 8_000_000_000_000,
			});
			expect(analytics.track).toHaveBeenCalledWith("item_added", {
				household_id: "hh_avery",
				list_id: "lst_weekend",
				item_id: item.id,
				user_id: "usr_avery",
			});
		} finally {
			await household.close();
		}
	});

	it("assigns the next position after existing non-deleted Items", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values({
				id: "lst_weekend",
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});
			await household.db.insert(items).values([
				{
					id: "itm_existing",
					listId: "lst_weekend",
					name: "Apples",
					position: 2,
					createdByUserId: "usr_avery",
				},
				{
					id: "itm_deleted",
					listId: "lst_weekend",
					name: "Deleted",
					position: 20,
					createdByUserId: "usr_avery",
					deletedAt: 1,
				},
			]);
			const service = createItemService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.addItem({
					listId: "lst_weekend",
					userId: "usr_avery",
					name: "Milk",
				}),
			).resolves.toMatchObject({ position: 3 });
		} finally {
			await household.close();
		}
	});

	it("rejects empty Item names before writing", async () => {
		const analytics = analyticsFixture();
		const execute = jest.fn(async () => ({ rows: [] }));
		const service = createItemService({
			householdId: "hh_avery",
			store: { execute },
			logger: testLogger,
			analytics,
		});

		await expect(
			service.addItem({
				listId: "lst_weekend",
				userId: "usr_avery",
				name: "   ",
			}),
		).rejects.toThrow("Item name is required");
		expect(execute).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("updates checked state with monotonic service timestamps", async () => {
		const household = await createTestHouseholdDb();
		const analytics = analyticsFixture();
		const rawTimestamps = [
			9_000_000_000_000, 8_999_999_999_999, 8_999_999_999_999,
		];
		jest
			.spyOn(Date, "now")
			.mockImplementation(() => rawTimestamps.shift() ?? 8_999_999_999_999);

		try {
			await household.db.insert(lists).values({
				id: "lst_weekend",
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});
			const service = createItemService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
				analytics,
			});

			const milk = await service.addItem({
				listId: "lst_weekend",
				userId: "usr_avery",
				name: "Milk",
			});
			const eggs = await service.addItem({
				listId: "lst_weekend",
				userId: "usr_avery",
				name: "Eggs",
			});
			await service.setItemChecked({
				itemId: milk.id,
				userId: "usr_avery",
				checked: true,
			});

			const [milkRow, eggsRow] = await household.db
				.select()
				.from(items)
				.orderBy(items.position);
			const checkRow = await household.db.query.itemChecks.findFirst({
				where: (table, { eq }) => eq(table.itemId, milk.id),
			});

			expect(milkRow).toMatchObject({
				id: milk.id,
				createdAt: 9_000_000_000_000,
				updatedAt: 9_000_000_000_000,
			});
			expect(eggsRow).toMatchObject({
				id: eggs.id,
				createdAt: 9_000_000_000_001,
				updatedAt: 9_000_000_000_001,
			});
			expect(checkRow).toMatchObject({
				itemId: milk.id,
				userId: "usr_avery",
				checkedAt: 9_000_000_000_002,
				updatedAt: 9_000_000_000_002,
			});
			expect(analytics.track).toHaveBeenCalledWith(
				"item_checked_state_changed",
				{
					household_id: "hh_avery",
					item_id: milk.id,
					user_id: "usr_avery",
					checked: true,
				},
			);
		} finally {
			await household.close();
		}
	});

	it("unchecks an Item for the active User and derives the unchecked state", async () => {
		const household = await createTestHouseholdDb();
		const analytics = analyticsFixture();
		const rawTimestamps = [
			10_000_000_000_000, 10_000_000_000_001, 10_000_000_000_002,
		];
		jest
			.spyOn(Date, "now")
			.mockImplementation(() => rawTimestamps.shift() ?? 10_000_000_000_002);

		try {
			await household.db.insert(lists).values({
				id: "lst_weekend",
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
			});
			const service = createItemService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
				analytics,
			});
			const milk = await service.addItem({
				listId: "lst_weekend",
				userId: "usr_avery",
				name: "Milk",
			});

			await service.setItemChecked({
				itemId: milk.id,
				userId: "usr_avery",
				checked: true,
			});
			await service.setItemChecked({
				itemId: milk.id,
				userId: "usr_avery",
				checked: false,
			});

			const checkRow = await household.db.query.itemChecks.findFirst({
				where: (table, { eq }) => eq(table.itemId, milk.id),
			});
			await expect(
				service.listItems({ listId: "lst_weekend" }),
			).resolves.toEqual([
				expect.objectContaining({
					id: milk.id,
					checked: false,
					checkedByUserId: null,
				}),
			]);
			expect(checkRow).toMatchObject({
				itemId: milk.id,
				userId: "usr_avery",
				checkedAt: null,
				updatedAt: 10_000_000_000_002,
			});
			expect(analytics.track).toHaveBeenCalledWith(
				"item_checked_state_changed",
				{
					household_id: "hh_avery",
					item_id: milk.id,
					user_id: "usr_avery",
					checked: false,
				},
			);
		} finally {
			await household.close();
		}
	});

	it("does not track checked state changes when the local write fails", async () => {
		const analytics = analyticsFixture();
		const service = createItemService({
			householdId: "hh_avery",
			store: {
				async execute() {
					throw new Error("local write failed");
				},
			},
			logger: testLogger,
			analytics,
		});

		await expect(
			service.setItemChecked({
				itemId: "itm_milk",
				userId: "usr_avery",
				checked: true,
			}),
		).rejects.toThrow("local write failed");
		expect(analytics.track).not.toHaveBeenCalled();
	});
});

function analyticsFixture() {
	return {
		track: jest.fn(),
	};
}

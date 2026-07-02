import {
	createTestProductDatabase,
	type TestProductDatabase,
} from "@/test/product-database";
import { createItemService, type ItemService } from "./item-service";

const HOUSEHOLD = "hh_1";
const OTHER_HOUSEHOLD = "hh_2";

describe("createItemService", () => {
	let store: TestProductDatabase;
	let service: ItemService;

	beforeEach(() => {
		store = createTestProductDatabase();
		service = createItemService({ householdId: HOUSEHOLD, store });
		store.seedList({ id: "lst_groceries", householdId: HOUSEHOLD });
	});

	afterEach(() => {
		store.close();
		jest.restoreAllMocks();
	});

	describe("listItems", () => {
		it("returns Items with shared checked-state attribution", async () => {
			store.seedItem({
				id: "itm_milk",
				listId: "lst_groceries",
				name: "Milk",
				quantity: "1 gal",
				position: 0,
				createdByUserId: "usr_river",
			});
			store.seedItemCheck({
				id: "chk_milk",
				itemId: "itm_milk",
				checkedAtMillis: 1_780_000_000_000,
				checkedByUserId: "usr_avery",
			});

			await expect(
				service.listItems({ listId: "lst_groceries" }),
			).resolves.toEqual([
				{
					id: "itm_milk",
					householdId: HOUSEHOLD,
					listId: "lst_groceries",
					name: "Milk",
					quantity: "1 gal",
					notes: null,
					checked: true,
					checkedByUserId: "usr_avery",
					position: 0,
					createdByUserId: "usr_river",
					createdAt: expect.any(Number),
					updatedAt: expect.any(Number),
				},
			]);
		});

		it("treats an Item with no check row, and an uncheck (checked_at NULL), as unchecked", async () => {
			store.seedItem({ id: "itm_a", listId: "lst_groceries", position: 0 });
			store.seedItem({ id: "itm_b", listId: "lst_groceries", position: 1 });
			// itm_b has a persistent check row that was unchecked.
			store.seedItemCheck({
				id: "chk_b",
				itemId: "itm_b",
				checkedAtMillis: null,
				checkedByUserId: "usr_avery",
			});

			const items = await service.listItems({ listId: "lst_groceries" });

			expect(
				items.map((item) => ({
					id: item.id,
					checked: item.checked,
					by: item.checkedByUserId,
				})),
			).toEqual([
				{ id: "itm_a", checked: false, by: null },
				{ id: "itm_b", checked: false, by: null },
			]);
		});

		it("excludes soft-deleted Items and orders by position", async () => {
			store.seedItem({ id: "itm_2", listId: "lst_groceries", position: 2 });
			store.seedItem({ id: "itm_0", listId: "lst_groceries", position: 0 });
			store.seedItem({
				id: "itm_gone",
				listId: "lst_groceries",
				position: 1,
				deletedAtMillis: 1_780_000_000_000,
			});

			const items = await service.listItems({ listId: "lst_groceries" });

			expect(items.map((item) => item.id)).toEqual(["itm_0", "itm_2"]);
		});

		it("scopes to the Household — an Item under another Household's List is not returned", async () => {
			store.seedList({ id: "lst_other", householdId: OTHER_HOUSEHOLD });
			store.seedItem({ id: "itm_other", listId: "lst_other", position: 0 });
			const items = await service.listItems({ listId: "lst_other" });
			expect(items).toEqual([]);
		});
	});

	describe("addItem", () => {
		it("appends Items with incrementing positions and trims input", async () => {
			const first = await service.addItem({
				listId: "lst_groceries",
				userId: "usr_avery",
				name: "  Milk  ",
				quantity: "  1 gallon ",
				notes: " ",
			});
			const second = await service.addItem({
				listId: "lst_groceries",
				userId: "usr_avery",
				name: "Bread",
				quantity: null,
				notes: null,
			});

			expect(first).toMatchObject({
				householdId: HOUSEHOLD,
				name: "Milk",
				quantity: "1 gallon",
				notes: null,
				position: 0,
				checked: false,
				checkedByUserId: null,
				createdByUserId: "usr_avery",
			});
			expect(second.position).toBe(1);
			const persisted = await service.listItems({ listId: "lst_groceries" });
			expect(persisted.map((item) => item.name)).toEqual(["Milk", "Bread"]);
		});

		it("rejects a blank name without writing", async () => {
			await expect(
				service.addItem({
					listId: "lst_groceries",
					userId: "usr_avery",
					name: "   ",
					quantity: null,
					notes: null,
				}),
			).rejects.toThrow("Item name is required");
			expect(
				store.raw.prepare("SELECT COUNT(*) AS n FROM items").get(),
			).toEqual({ n: 0 });
		});

		it.each([
			["deleted", { deletedAtMillis: 1_780_000_000_000 }],
			["archived", { archivedAtMillis: 1_780_000_000_000 }],
		])("refuses to add to a %s List", async (_label, lifecycle) => {
			store.seedList({ id: "lst_dead", householdId: HOUSEHOLD, ...lifecycle });
			await expect(
				service.addItem({
					listId: "lst_dead",
					userId: "usr_avery",
					name: "Milk",
					quantity: null,
					notes: null,
				}),
			).rejects.toThrow("List is not active");
		});

		it("refuses to add to another Household's List", async () => {
			store.seedList({ id: "lst_other", householdId: OTHER_HOUSEHOLD });
			await expect(
				service.addItem({
					listId: "lst_other",
					userId: "usr_avery",
					name: "Milk",
					quantity: null,
					notes: null,
				}),
			).rejects.toThrow("List is not active");
		});
	});

	describe("setItemChecked", () => {
		beforeEach(() => {
			store.seedItem({ id: "itm_milk", listId: "lst_groceries", position: 0 });
		});

		it("keeps one shared check row across check -> uncheck -> recheck with attribution and LWW", async () => {
			await service.setItemChecked({
				listId: "lst_groceries",
				itemId: "itm_milk",
				userId: "usr_avery",
				checked: true,
			});
			expect(await checkedView()).toEqual({ checked: true, by: "usr_avery" });
			const afterCheck = checkRow();
			expect(afterCheck.count).toBe(1);
			expect(afterCheck.checked_at).not.toBeNull();

			await service.setItemChecked({
				listId: "lst_groceries",
				itemId: "itm_milk",
				userId: "usr_blake",
				checked: false,
			});
			// Uncheck persists the row (tombstone, never delete) with checked_at NULL.
			const afterUncheck = checkRow();
			expect(afterUncheck.count).toBe(1);
			expect(afterUncheck.checked_at).toBeNull();
			expect(afterUncheck.checked_by_user_id).toBe("usr_blake");
			expect(await checkedView()).toEqual({ checked: false, by: null });
			// LWW: updated_at advances monotonically.
			expect(afterUncheck.updated_at > afterCheck.updated_at).toBe(true);

			await service.setItemChecked({
				listId: "lst_groceries",
				itemId: "itm_milk",
				userId: "usr_casey",
				checked: true,
			});
			const afterRecheck = checkRow();
			expect(afterRecheck.count).toBe(1);
			expect(await checkedView()).toEqual({ checked: true, by: "usr_casey" });
			expect(afterRecheck.updated_at > afterUncheck.updated_at).toBe(true);
		});

		it("throws for a missing Item", async () => {
			await expect(
				service.setItemChecked({
					listId: "lst_groceries",
					itemId: "itm_ghost",
					userId: "usr_avery",
					checked: true,
				}),
			).rejects.toThrow("Item not found in List");
		});

		it.each([
			["a deleted List", { deletedAtMillis: 1 }],
			["an archived List", { archivedAtMillis: 1 }],
		])("throws for an Item in %s", async (_label, lifecycle) => {
			store.seedList({ id: "lst_dead", householdId: HOUSEHOLD, ...lifecycle });
			store.seedItem({ id: "itm_dead", listId: "lst_dead", position: 0 });
			await expect(
				service.setItemChecked({
					listId: "lst_dead",
					itemId: "itm_dead",
					userId: "usr_avery",
					checked: true,
				}),
			).rejects.toThrow("Item not found in List");
		});

		it("refuses to check an Item under another Household's List", async () => {
			store.seedList({ id: "lst_other", householdId: OTHER_HOUSEHOLD });
			store.seedItem({ id: "itm_other", listId: "lst_other", position: 0 });
			await expect(
				service.setItemChecked({
					listId: "lst_other",
					itemId: "itm_other",
					userId: "usr_avery",
					checked: true,
				}),
			).rejects.toThrow("Item not found in List");
		});
	});

	async function checkedView(): Promise<{
		checked: boolean;
		by: string | null;
	}> {
		const [item] = await service.listItems({ listId: "lst_groceries" });
		return { checked: item.checked, by: item.checkedByUserId };
	}

	function checkRow(): {
		count: number;
		checked_at: string | null;
		checked_by_user_id: string | null;
		updated_at: string;
	} {
		const count = store.raw
			.prepare("SELECT COUNT(*) AS n FROM item_checks WHERE item_id = ?")
			.get("itm_milk") as { n: number };
		const row = store.raw
			.prepare(
				"SELECT checked_at, checked_by_user_id, updated_at FROM item_checks WHERE item_id = ?",
			)
			.get("itm_milk") as {
			checked_at: string | null;
			checked_by_user_id: string | null;
			updated_at: string;
		};
		return { count: count.n, ...row };
	}
});

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
		it("keeps listItemsQuery compile and execute paths in lockstep while scoping to the Household", async () => {
			store.seedItem({ id: "itm_milk", listId: "lst_groceries", position: 0 });
			store.seedItem({
				id: "itm_bread",
				listId: "lst_groceries",
				position: 1,
			});
			store.seedList({ id: "lst_other", householdId: OTHER_HOUSEHOLD });
			store.seedItem({ id: "itm_other", listId: "lst_other", position: 0 });

			const query = service.listItemsQuery({ listId: "lst_groceries" });
			const executed = await query.execute();

			await expect(
				service.listItems({ listId: "lst_groceries" }),
			).resolves.toEqual(executed);
			const compiled = query.compile();
			expect(compiled.parameters).toEqual([HOUSEHOLD, "lst_groceries"]);
			const compiledRows = await store.getAll<
				{ id: string } & Record<string, unknown>
			>(compiled.sql, [...compiled.parameters]);
			expect(compiledRows.map((row) => row.id)).toEqual(
				executed.map((item) => item.id),
			);

			const scopedOutQuery = service.listItemsQuery({ listId: "lst_other" });
			await expect(scopedOutQuery.execute()).resolves.toEqual([]);
			const scopedOutCompiled = scopedOutQuery.compile();
			await expect(
				store.getAll(scopedOutCompiled.sql, [...scopedOutCompiled.parameters]),
			).resolves.toEqual([]);
		});

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

		it("orders unchecked Items before checked Items while preserving position order", async () => {
			store.seedItem({
				id: "itm_checked_first",
				listId: "lst_groceries",
				position: 0,
			});
			store.seedItem({
				id: "itm_unchecked_no_row",
				listId: "lst_groceries",
				position: 1,
			});
			store.seedItem({
				id: "itm_gone",
				listId: "lst_groceries",
				position: 2,
				deletedAtMillis: 1_780_000_000_000,
			});
			store.seedItem({
				id: "itm_unchecked_null_row",
				listId: "lst_groceries",
				position: 3,
			});
			store.seedItem({
				id: "itm_checked_last",
				listId: "lst_groceries",
				position: 4,
			});
			store.seedItemCheck({
				id: "chk_checked_first",
				itemId: "itm_checked_first",
				checkedAtMillis: 1_780_000_000_000,
				checkedByUserId: "usr_avery",
			});
			store.seedItemCheck({
				id: "chk_unchecked_null_row",
				itemId: "itm_unchecked_null_row",
				checkedAtMillis: null,
				checkedByUserId: "usr_avery",
			});
			store.seedItemCheck({
				id: "chk_checked_last",
				itemId: "itm_checked_last",
				checkedAtMillis: 1_780_000_001_000,
				checkedByUserId: "usr_avery",
			});

			const items = await service.listItems({ listId: "lst_groceries" });

			expect(items.map((item) => item.id)).toEqual([
				"itm_unchecked_no_row",
				"itm_unchecked_null_row",
				"itm_checked_first",
				"itm_checked_last",
			]);
		});

		it("moves a checked Item to the bottom group and restores its durable position when unchecked", async () => {
			store.seedItem({
				id: "itm_position_zero",
				listId: "lst_groceries",
				position: 0,
			});
			store.seedItem({
				id: "itm_position_one",
				listId: "lst_groceries",
				position: 1,
			});

			await expect(itemIds()).resolves.toEqual([
				"itm_position_zero",
				"itm_position_one",
			]);

			await service.setItemChecked({
				listId: "lst_groceries",
				itemId: "itm_position_zero",
				userId: "usr_avery",
				checked: true,
			});
			await expect(itemIds()).resolves.toEqual([
				"itm_position_one",
				"itm_position_zero",
			]);

			await service.setItemChecked({
				listId: "lst_groceries",
				itemId: "itm_position_zero",
				userId: "usr_avery",
				checked: false,
			});
			await expect(itemIds()).resolves.toEqual([
				"itm_position_zero",
				"itm_position_one",
			]);
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

	describe("updateItem", () => {
		beforeEach(() => {
			store.seedList({ id: "lst_pantry", householdId: HOUSEHOLD });
			store.seedItem({
				id: "itm_milk",
				listId: "lst_groceries",
				name: "Milk",
				quantity: "1",
				notes: "Whole",
				position: 2,
			});
		});

		it("updates and trims content without changing its List position", async () => {
			const updated = await service.updateItem({
				itemId: "itm_milk",
				sourceListId: "lst_groceries",
				destinationListId: "lst_groceries",
				name: " Oat milk ",
				quantity: " 2 ",
				notes: "  ",
			});

			expect(updated).toMatchObject({
				id: "itm_milk",
				listId: "lst_groceries",
				name: "Oat milk",
				quantity: "2",
				notes: null,
				position: 2,
			});
			await expect(
				service.listItems({ listId: "lst_groceries" }),
			).resolves.toEqual([updated]);
		});

		it("moves an Item to the destination tail while preserving completion", async () => {
			store.seedItem({
				id: "itm_flour",
				listId: "lst_pantry",
				position: 4,
			});
			store.seedItemCheck({
				id: "chk_milk",
				itemId: "itm_milk",
				checkedAtMillis: 1_780_000_000_000,
				checkedByUserId: "usr_avery",
			});

			const moved = await service.updateItem({
				itemId: "itm_milk",
				sourceListId: "lst_groceries",
				destinationListId: "lst_pantry",
				name: "Milk",
				quantity: "1",
				notes: "Whole",
			});

			expect(moved).toMatchObject({
				listId: "lst_pantry",
				position: 5,
				checked: true,
				checkedByUserId: "usr_avery",
			});
			await expect(
				service.listItems({ listId: "lst_groceries" }),
			).resolves.toEqual([]);
			expect(
				(await service.listItems({ listId: "lst_pantry" })).map(
					(item) => item.id,
				),
			).toEqual(["itm_flour", "itm_milk"]);
		});

		it("rejects a stale source List without changing the Item", async () => {
			await expect(
				service.updateItem({
					itemId: "itm_milk",
					sourceListId: "lst_pantry",
					destinationListId: "lst_pantry",
					name: "Oat milk",
					quantity: null,
					notes: null,
				}),
			).rejects.toThrow("Item not found in source List");

			const [stored] = await service.listItems({ listId: "lst_groceries" });
			expect(stored.name).toBe("Milk");
		});

		it.each([
			["deleted", { deletedAtMillis: 1_780_000_000_000 }],
			["archived", { archivedAtMillis: 1_780_000_000_000 }],
		])("refuses to move into a %s List", async (_label, lifecycle) => {
			store.seedList({
				id: `lst_${_label}`,
				householdId: HOUSEHOLD,
				...lifecycle,
			});

			await expect(
				service.updateItem({
					itemId: "itm_milk",
					sourceListId: "lst_groceries",
					destinationListId: `lst_${_label}`,
					name: "Milk",
					quantity: "1",
					notes: "Whole",
				}),
			).rejects.toThrow("Destination List is not active");
		});

		it("refuses to move into another Household's List", async () => {
			store.seedList({ id: "lst_other", householdId: OTHER_HOUSEHOLD });

			await expect(
				service.updateItem({
					itemId: "itm_milk",
					sourceListId: "lst_groceries",
					destinationListId: "lst_other",
					name: "Milk",
					quantity: "1",
					notes: "Whole",
				}),
			).rejects.toThrow("Destination List is not active");
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

	async function itemIds(): Promise<string[]> {
		const items = await service.listItems({ listId: "lst_groceries" });
		return items.map((item) => item.id);
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

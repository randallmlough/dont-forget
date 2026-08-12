import {
	createTestProductDatabase,
	type TestProductDatabase,
} from "@mobile/test/product-database";
import { createListService, type ListService } from "./list-service";

const HOUSEHOLD = "hh_1";
const OTHER_HOUSEHOLD = "hh_2";
const USER = "usr_avery";

describe("createListService", () => {
	let store: TestProductDatabase;
	let service: ListService;

	beforeEach(() => {
		store = createTestProductDatabase();
		service = createListService({
			householdId: HOUSEHOLD,
			userId: USER,
			store,
		});
	});

	afterEach(() => {
		store.close();
		jest.restoreAllMocks();
	});

	describe("createList", () => {
		it("creates a List scoped to the Household", async () => {
			const result = await service.createList({ name: "  Groceries  " });

			expect(result).toMatchObject({
				status: "available",
				didWrite: true,
				list: {
					householdId: HOUSEHOLD,
					name: "Groceries",
					createdByUserId: USER,
					archived: false,
					archivedAt: null,
				},
			});
			const row = store.raw
				.prepare("SELECT household_id, name FROM lists WHERE id = ?")
				.get(result.status === "available" ? result.list.id : "");
			expect(row).toEqual({ household_id: HOUSEHOLD, name: "Groceries" });
		});

		it.each([
			["required", "   "],
			["tooLong", "x".repeat(81)],
		])("rejects an invalid name (%s) without writing", async (reason, name) => {
			await expect(service.createList({ name })).resolves.toEqual({
				status: "invalidName",
				reason,
				didWrite: false,
			});
			expect(
				store.raw.prepare("SELECT COUNT(*) AS n FROM lists").get(),
			).toEqual({
				n: 0,
			});
		});
	});

	describe("renameList / deleteList lifecycle", () => {
		it("renames an active List and no-ops an identical rename", async () => {
			const created = await service.createList({ name: "Groceries" });
			const listId = created.status === "available" ? created.list.id : "";

			const renamed = await service.renameList({ listId, name: "Pantry" });
			expect(renamed).toMatchObject({ status: "available", didWrite: true });

			const noop = await service.renameList({ listId, name: "Pantry" });
			expect(noop).toMatchObject({ status: "available", didWrite: false });
		});

		it("deletes a List and reports already-deleted on a second delete", async () => {
			const created = await service.createList({ name: "Groceries" });
			const listId = created.status === "available" ? created.list.id : "";

			const deleted = await service.deleteList({ listId });
			expect(deleted).toMatchObject({ status: "deleted", didWrite: true });

			const again = await service.deleteList({ listId });
			expect(again).toMatchObject({ status: "deleted", didWrite: false });
		});

		it("refuses to rename another Household's List", async () => {
			store.seedList({ id: "lst_other", householdId: OTHER_HOUSEHOLD });
			await expect(
				service.renameList({ listId: "lst_other", name: "Mine" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_other",
				didWrite: false,
			});
		});

		it("reclassifies a rename that loses the delete race as deleted", async () => {
			const created = await service.createList({ name: "Groceries" });
			const listId = created.status === "available" ? created.list.id : "";

			// Simulate a concurrent delete landing between the pre-read and the
			// guarded UPDATE: the first getOptional (the pre-read) returns the active
			// row, then we tombstone it, so the UPDATE matches 0 rows and the service
			// re-reads and reclassifies.
			const realGetOptional = store.getOptional.bind(store);
			jest
				.spyOn(store, "getOptional")
				.mockImplementationOnce(async (sql, params) => {
					const row = await realGetOptional(sql, params);
					store.raw
						.prepare("UPDATE lists SET deleted_at = ? WHERE id = ?")
						.run("2030-01-01T00:00:00.000Z", listId);
					return row;
				});

			const result = await service.renameList({ listId, name: "Pantry" });
			expect(result).toMatchObject({ status: "deleted", didWrite: false });
		});
	});

	describe("listLists summaries", () => {
		it("keeps listListsQuery compile and execute paths in lockstep", async () => {
			store.seedList({
				id: "lst_old",
				householdId: HOUSEHOLD,
				updatedAtMillis: 1_000,
			});
			store.seedList({
				id: "lst_new",
				householdId: HOUSEHOLD,
				updatedAtMillis: 2_000,
			});
			store.seedItem({ id: "itm_old", listId: "lst_old", position: 0 });
			store.seedItem({ id: "itm_new", listId: "lst_new", position: 0 });
			store.seedItemCheck({
				id: "chk_old",
				itemId: "itm_old",
				checkedAtMillis: 9_000,
				checkedByUserId: USER,
				updatedAtMillis: 9_000,
			});

			const input = { archive: "active", sort: "recentActivity" } as const;
			const query = service.listListsQuery(input);
			const executed = await query.execute();

			await expect(service.listLists(input)).resolves.toEqual(executed);
			const compiled = query.compile();
			const compiledRows = await store.getAll<
				{ id: string } & Record<string, unknown>
			>(compiled.sql, [...compiled.parameters]);
			expect(compiledRows.map((row) => row.id)).toEqual(
				executed.map((summary) => summary.id),
			);
		});

		it("flows listListsQuery input into compiled parameters", () => {
			const compiled = service
				.listListsQuery({
					searchText: "Gro_%",
					createdByUserId: USER,
				})
				.compile();

			expect(compiled.parameters).toEqual([HOUSEHOLD, "%Gro\\_\\%%", USER]);
		});

		it("counts checked/unchecked under the single shared-check join", async () => {
			store.seedList({
				id: "lst_a",
				householdId: HOUSEHOLD,
				name: "Groceries",
			});
			store.seedItem({ id: "itm_1", listId: "lst_a", position: 0 });
			store.seedItem({ id: "itm_2", listId: "lst_a", position: 1 });
			store.seedItem({ id: "itm_3", listId: "lst_a", position: 2 });
			// itm_1 checked; itm_2 has an unchecked (persistent) check row; itm_3 none.
			store.seedItemCheck({
				id: "chk_1",
				itemId: "itm_1",
				checkedAtMillis: 1_780_000_000_000,
				checkedByUserId: USER,
			});
			store.seedItemCheck({
				id: "chk_2",
				itemId: "itm_2",
				checkedAtMillis: null,
				checkedByUserId: USER,
			});

			const [summary] = await service.listLists();
			expect(summary).toMatchObject({
				id: "lst_a",
				uncheckedItemCount: 2,
				checkedItemCount: 1,
			});
		});

		it("orders by most recent activity, counting item and check timestamps", async () => {
			store.seedList({
				id: "lst_old",
				householdId: HOUSEHOLD,
				updatedAtMillis: 1_000,
			});
			store.seedList({
				id: "lst_new",
				householdId: HOUSEHOLD,
				updatedAtMillis: 2_000,
			});
			// A late check on the otherwise-older List bumps it to the top.
			store.seedItem({ id: "itm_old", listId: "lst_old", position: 0 });
			store.seedItemCheck({
				id: "chk_old",
				itemId: "itm_old",
				checkedAtMillis: 9_000,
				checkedByUserId: USER,
				updatedAtMillis: 9_000,
			});

			const summaries = await service.listLists({ sort: "recentActivity" });
			expect(summaries.map((s) => s.id)).toEqual(["lst_old", "lst_new"]);
		});

		it("applies the archive filter, search, and Household scope", async () => {
			store.seedList({
				id: "lst_active",
				householdId: HOUSEHOLD,
				name: "Groceries",
			});
			store.seedList({
				id: "lst_archived",
				householdId: HOUSEHOLD,
				name: "Holiday",
				archivedAtMillis: 1_780_000_000_000,
			});
			store.seedList({
				id: "lst_foreign",
				householdId: OTHER_HOUSEHOLD,
				name: "Groceries",
			});

			await expect(service.listLists()).resolves.toMatchObject([
				{ id: "lst_active" },
			]);
			await expect(
				service.listLists({ archive: "archived" }),
			).resolves.toMatchObject([{ id: "lst_archived" }]);
			await expect(service.listLists({ archive: "all" })).resolves.toHaveLength(
				2,
			);
			await expect(
				service.listLists({ searchText: "groc" }),
			).resolves.toMatchObject([{ id: "lst_active" }]);
		});
	});
});

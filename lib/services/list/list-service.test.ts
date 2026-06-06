import {
	itemCheckFixture,
	itemFixture,
	listFixture,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { itemChecks, items, lists } from "@/db/schema/household";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import { analyticsMocks } from "@/lib/test/mocks/analytics";
import { createMockLogger } from "@/lib/test/mocks/logger";

import { createListService, LIST_NAME_MAX_LENGTH } from "./list-service";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

const testLogger = createMockLogger();
testLogger.with.mockReturnValue(testLogger);

beforeEach(() => {
	testLogger.debug.mockReset();
	testLogger.info.mockReset();
	testLogger.warn.mockReset();
	testLogger.error.mockReset();
	testLogger.with.mockClear();
	testLogger.with.mockReturnValue(testLogger);
	analyticsMocks.track.mockReset();
});

describe("createListService", () => {
	it("creates a List locally with the authenticated app-owned User ID as creator", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			const result = await service.createList({
				name: "Costco",
			});

			expect(result).toMatchObject({
				status: "created",
				list: {
					householdId: "hh_avery",
					name: "Costco",
					createdByUserId: "usr_avery",
					createdAt: expect.any(Number),
					updatedAt: expect.any(Number),
				},
			});
			if (result.status !== "created") {
				throw new Error("Expected List creation to succeed");
			}
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, result.list.id),
				}),
			).resolves.toMatchObject({
				id: result.list.id,
				name: "Costco",
				createdByUserId: "usr_avery",
				deletedAt: null,
			});
		} finally {
			await household.close();
		}
	});

	it("trims leading and trailing whitespace while preserving internal whitespace", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.createList({
					name: "  Camping   Weekend  ",
				}),
			).resolves.toMatchObject({
				status: "created",
				list: { name: "Camping   Weekend" },
			});
		} finally {
			await household.close();
		}
	});

	it("returns typed validation results for empty and too-long names", async () => {
		const execute = jest.fn(async () => ({
			rows: [],
			rowsAffected: 0,
			lastInsertRowId: null,
		}));
		const service = createListService({
			householdId: "hh_avery",
			authenticatedUserId: "usr_avery",
			store: { execute },
			logger: testLogger,
		});

		await expect(
			service.createList({
				name: "   ",
			}),
		).resolves.toEqual({
			status: "invalid",
			error: { code: "empty-name", name: "" },
		});
		await expect(
			service.createList({
				name: "A".repeat(LIST_NAME_MAX_LENGTH + 1),
			}),
		).resolves.toEqual({
			status: "invalid",
			error: {
				code: "name-too-long",
				name: "A".repeat(LIST_NAME_MAX_LENGTH + 1),
				maxLength: LIST_NAME_MAX_LENGTH,
			},
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("allows duplicate List names", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco_existing",
					name: "Costco",
					createdByUserId: "usr_avery",
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.createList({
					name: "Costco",
				}),
			).resolves.toMatchObject({
				status: "created",
				list: { name: "Costco" },
			});
			await expect(household.db.query.lists.findMany()).resolves.toHaveLength(
				2,
			);
		} finally {
			await household.close();
		}
	});

	it("emits list_created without user-content properties after successful create", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			const result = await service.createList({
				name: "Secret Shopping Name",
			});

			if (result.status !== "created") {
				throw new Error("Expected List creation to succeed");
			}
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_created", {
				household_id: "hh_avery",
				list_id: result.list.id,
				user_id: "usr_avery",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_created",
				expect.objectContaining({
					name: expect.any(String),
				}),
			);
			expect(JSON.stringify(analyticsMocks.track.mock.calls)).not.toContain(
				"Secret Shopping Name",
			);
		} finally {
			await household.close();
		}
	});

	it("ignores caller-supplied creator overrides at runtime", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});
			const callerInputWithOverride: {
				name: string;
				createdByUserId: string;
			} = {
				name: "Costco",
				createdByUserId: "usr_mallory",
			};

			const result = await service.createList(callerInputWithOverride);

			if (result.status !== "created") {
				throw new Error("Expected List creation to succeed");
			}
			expect(result.list.createdByUserId).toBe("usr_avery");
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, result.list.id),
				}),
			).resolves.toMatchObject({
				createdByUserId: "usr_avery",
			});
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_created", {
				household_id: "hh_avery",
				list_id: result.list.id,
				user_id: "usr_avery",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_created",
				expect.objectContaining({ user_id: "usr_mallory" }),
			);
		} finally {
			await household.close();
		}
	});

	it("loads List metadata by List ID", async () => {
		const directory = await createTestDirectoryDb();
		const household = await createTestHouseholdDb();

		try {
			const scenario = await seedPrimaryHouseholdScenario({
				directory: directory.db,
				household: household.db,
			});
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.getList({ listId: scenario.lists.groceries.id }),
			).resolves.toEqual({
				status: "available",
				list: {
					id: scenario.lists.groceries.id,
					householdId: scenario.household.id,
					name: scenario.lists.groceries.name,
					createdByUserId: scenario.users.avery.id,
					createdAt: scenario.lists.groceries.createdAt,
					updatedAt: scenario.lists.groceries.updatedAt,
					archived: false,
					archivedAt: null,
				},
			});
		} finally {
			await directory.close();
			await household.close();
		}
	});

	it("coerces string SQL timestamp columns when loading List metadata", async () => {
		const service = createListService({
			householdId: "hh_avery",
			authenticatedUserId: "usr_avery",
			store: {
				async execute() {
					return {
						rows: [
							{
								id: "lst_weekend",
								name: "Weekend Groceries",
								created_by_user_id: "usr_avery",
								created_at: "1700000000000",
								updated_at: "1700000000100",
								archived_at: null,
								deleted_at: null,
							},
						],
						rowsAffected: 0,
					};
				},
			},
			logger: testLogger,
		});

		await expect(service.getList({ listId: "lst_weekend" })).resolves.toEqual(
			expect.objectContaining({
				status: "available",
				list: expect.objectContaining({
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			}),
		);
	});

	it("returns missing when the List is missing", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.getList({ listId: "lst_missing" })).resolves.toEqual(
				{
					status: "missing",
					listId: "lst_missing",
				},
			);
		} finally {
			await household.close();
		}
	});

	it("returns deleted when the List is tombstoned", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_archived",
					name: "Archived Groceries",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_150,
					deletedAt: 1_700_000_000_200,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.getList({ listId: "lst_archived" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_archived",
				deletedAt: 1_700_000_000_200,
				updatedAt: 1_700_000_000_150,
			});
		} finally {
			await household.close();
		}
	});

	it("returns archived Lists as available metadata", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_archived",
					name: "Archived Groceries",
					createdByUserId: "usr_avery",
					archivedAt: 1_700_000_000_200,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.getList({ listId: "lst_archived" }),
			).resolves.toEqual({
				status: "available",
				list: expect.objectContaining({
					id: "lst_archived",
					archived: true,
					archivedAt: 1_700_000_000_200,
				}),
			});
		} finally {
			await household.close();
		}
	});

	it("lists active summaries with counts and last activity from non-deleted Items and latest check states", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_groceries",
					name: "Groceries",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			await household.db.insert(items).values([
				itemFixture({
					id: "itm_unchecked",
					listId: "lst_groceries",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_200,
				}),
				itemFixture({
					id: "itm_checked",
					listId: "lst_groceries",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_300,
				}),
				itemFixture({
					id: "itm_unchecked_latest",
					listId: "lst_groceries",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_400,
				}),
				itemFixture({
					id: "itm_deleted",
					listId: "lst_groceries",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_900,
					deletedAt: 1_700_000_000_950,
				}),
			]);
			await household.db.insert(itemChecks).values([
				itemCheckFixture({
					itemId: "itm_checked",
					userId: "usr_avery",
					checkedAt: 1_700_000_000_500,
					updatedAt: 1_700_000_000_500,
				}),
				itemCheckFixture({
					itemId: "itm_unchecked_latest",
					userId: "usr_avery",
					checkedAt: 1_700_000_000_550,
					updatedAt: 1_700_000_000_550,
				}),
				itemCheckFixture({
					itemId: "itm_unchecked_latest",
					userId: "usr_blake",
					checkedAt: null,
					updatedAt: 1_700_000_000_600,
				}),
				itemCheckFixture({
					itemId: "itm_deleted",
					userId: "usr_avery",
					checkedAt: 1_700_000_000_980,
					updatedAt: 1_700_000_000_980,
				}),
			]);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.listLists()).resolves.toEqual([
				{
					id: "lst_groceries",
					householdId: "hh_avery",
					name: "Groceries",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
					archived: false,
					archivedAt: null,
					lastActivityAt: 1_700_000_000_600,
					uncheckedItemCount: 2,
					checkedItemCount: 1,
				},
			]);
		} finally {
			await household.close();
		}
	});

	it("falls back to the List row update for empty List activity", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_empty",
					name: "Empty",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.listLists()).resolves.toMatchObject([
				{
					id: "lst_empty",
					lastActivityAt: 1_700_000_000_100,
					uncheckedItemCount: 0,
					checkedItemCount: 0,
				},
			]);
		} finally {
			await household.close();
		}
	});

	it("filters summaries by archive state, search text, and creator while excluding deleted Lists from every segment", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values([
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_100,
				}),
				listFixture({
					id: "lst_camping",
					name: "Camping",
					createdByUserId: "usr_blake",
					updatedAt: 1_700_000_000_200,
				}),
				listFixture({
					id: "lst_deleted_costco",
					name: "Deleted Costco",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_300,
					deletedAt: 1_700_000_000_400,
				}),
				listFixture({
					id: "lst_archived_costco",
					name: "Archived Costco",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_500,
					archivedAt: 1_700_000_000_450,
				}),
			]);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.listLists({ archive: "active", searchText: "COST" }),
			).resolves.toMatchObject([{ id: "lst_costco" }]);
			await expect(
				service.listLists({ archive: "archived", searchText: "cost" }),
			).resolves.toMatchObject([
				{
					id: "lst_archived_costco",
					archived: true,
					archivedAt: 1_700_000_000_450,
				},
			]);
			await expect(
				service.listLists({ archive: "all", searchText: "cost" }),
			).resolves.toMatchObject([
				{ id: "lst_archived_costco" },
				{ id: "lst_costco" },
			]);
			await expect(
				service.listLists({ createdByUserId: "usr_blake" }),
			).resolves.toMatchObject([{ id: "lst_camping" }]);
		} finally {
			await household.close();
		}
	});

	it("sorts summaries deterministically by recent activity, name, and createdAt", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values([
				listFixture({
					id: "lst_beta_old",
					name: "beta",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
				listFixture({
					id: "lst_alpha",
					name: "Alpha",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_100,
					updatedAt: 1_700_000_000_100,
				}),
				listFixture({
					id: "lst_beta_new",
					name: "Beta",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_200,
					updatedAt: 1_700_000_000_100,
				}),
				listFixture({
					id: "lst_recent",
					name: "recent",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_050,
					updatedAt: 1_700_000_000_300,
				}),
			]);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.listLists()).resolves.toMatchObject([
				{ id: "lst_recent" },
				{ id: "lst_beta_old" },
				{ id: "lst_alpha" },
				{ id: "lst_beta_new" },
			]);
			await expect(service.listLists({ sort: "name" })).resolves.toMatchObject([
				{ id: "lst_alpha" },
				{ id: "lst_beta_old" },
				{ id: "lst_beta_new" },
				{ id: "lst_recent" },
			]);
			await expect(
				service.listLists({ sort: "createdAt" }),
			).resolves.toMatchObject([
				{ id: "lst_beta_new" },
				{ id: "lst_alpha" },
				{ id: "lst_recent" },
				{ id: "lst_beta_old" },
			]);
		} finally {
			await household.close();
		}
	});

	it("renames an active List with a trimmed name and updates updated_at", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			const result = await service.renameList({
				listId: "lst_costco",
				name: "  Camping   Weekend  ",
			});

			expect(result).toMatchObject({
				status: "renamed",
				list: {
					id: "lst_costco",
					name: "Camping   Weekend",
					updatedAt: expect.any(Number),
				},
			});
			if (result.status !== "renamed") {
				throw new Error("Expected List rename to succeed");
			}
			expect(result.list.updatedAt).toBeGreaterThan(1_700_000_000_100);
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, "lst_costco"),
				}),
			).resolves.toMatchObject({
				name: "Camping   Weekend",
				updatedAt: result.list.updatedAt,
			});
		} finally {
			await household.close();
		}
	});

	it("returns typed validation results for invalid rename names", async () => {
		const execute = jest.fn(async () => ({
			rows: [],
			rowsAffected: 0,
			lastInsertRowId: null,
		}));
		const service = createListService({
			householdId: "hh_avery",
			authenticatedUserId: "usr_avery",
			store: { execute },
			logger: testLogger,
		});

		await expect(
			service.renameList({ listId: "lst_costco", name: "   " }),
		).resolves.toEqual({
			status: "invalid",
			error: { code: "empty-name", name: "" },
		});
		await expect(
			service.renameList({
				listId: "lst_costco",
				name: "A".repeat(LIST_NAME_MAX_LENGTH + 1),
			}),
		).resolves.toEqual({
			status: "invalid",
			error: {
				code: "name-too-long",
				name: "A".repeat(LIST_NAME_MAX_LENGTH + 1),
				maxLength: LIST_NAME_MAX_LENGTH,
			},
		});
		expect(execute).not.toHaveBeenCalled();
	});

	it("allows renaming to a duplicate List name", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values([
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
				}),
				listFixture({
					id: "lst_weekend",
					name: "Weekend",
					createdByUserId: "usr_avery",
				}),
			]);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.renameList({ listId: "lst_weekend", name: "Costco" }),
			).resolves.toMatchObject({
				status: "renamed",
				list: { name: "Costco" },
			});
			await expect(
				household.db.query.lists.findMany({
					where: (table, { eq }) => eq(table.name, "Costco"),
				}),
			).resolves.toHaveLength(2);
		} finally {
			await household.close();
		}
	});

	it("treats the same trimmed rename as a no-op", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.renameList({ listId: "lst_costco", name: " Costco " }),
			).resolves.toMatchObject({
				status: "unchanged",
				list: { name: "Costco", updatedAt: 1_700_000_000_100 },
			});
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, "lst_costco"),
				}),
			).resolves.toMatchObject({
				name: "Costco",
				updatedAt: 1_700_000_000_100,
			});
			expect(analyticsMocks.track).not.toHaveBeenCalled();
		} finally {
			await household.close();
		}
	});

	it("returns missing and deleted lifecycle results for stale rename targets", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_deleted",
					name: "Deleted",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_150,
					deletedAt: 1_700_000_000_200,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.renameList({ listId: "lst_missing", name: "Costco" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
			});
			await expect(
				service.renameList({ listId: "lst_deleted", name: "Costco" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_deleted",
				deletedAt: 1_700_000_000_200,
				updatedAt: 1_700_000_000_150,
			});
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, "lst_deleted"),
				}),
			).resolves.toMatchObject({
				name: "Deleted",
				deletedAt: 1_700_000_000_200,
			});
			expect(analyticsMocks.track).not.toHaveBeenCalled();
		} finally {
			await household.close();
		}
	});

	it("reclassifies a rename as deleted when the guarded update affects no rows", async () => {
		const execute = jest
			.fn()
			.mockResolvedValueOnce({
				rows: [
					{
						id: "lst_costco",
						name: "Costco",
						created_by_user_id: "usr_avery",
						created_at: 1_700_000_000_000,
						updated_at: 1_700_000_000_100,
						archived_at: null,
						deleted_at: null,
					},
				],
				rowsAffected: 0,
				lastInsertRowId: null,
			})
			.mockResolvedValueOnce({
				rows: [],
				rowsAffected: 0,
				lastInsertRowId: null,
			})
			.mockResolvedValueOnce({
				rows: [
					{
						id: "lst_costco",
						name: "Costco",
						created_by_user_id: "usr_avery",
						created_at: 1_700_000_000_000,
						updated_at: 1_700_000_000_100,
						archived_at: null,
						deleted_at: 1_700_000_000_200,
					},
				],
				rowsAffected: 0,
				lastInsertRowId: null,
			});
		const service = createListService({
			householdId: "hh_avery",
			authenticatedUserId: "usr_avery",
			store: { execute },
			logger: testLogger,
		});

		await expect(
			service.renameList({ listId: "lst_costco", name: "Warehouse" }),
		).resolves.toEqual({
			status: "deleted",
			listId: "lst_costco",
			deletedAt: 1_700_000_000_200,
			updatedAt: 1_700_000_000_100,
		});
		expect(analyticsMocks.track).not.toHaveBeenCalled();
		expect(execute).toHaveBeenCalledTimes(3);
	});

	it("archives a List idempotently without timestamp churn when it is already archived", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_100,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			const result = await service.archiveList({ listId: "lst_costco" });
			expect(result).toMatchObject({
				status: "archived",
				list: {
					id: "lst_costco",
					archived: true,
					archivedAt: expect.any(Number),
					updatedAt: expect.any(Number),
				},
			});
			if (result.status !== "archived") {
				throw new Error("Expected archive to succeed");
			}
			expect(result.list.updatedAt).toBe(result.list.archivedAt);
			expect(result.list.updatedAt).toBeGreaterThan(1_700_000_000_100);
			await expect(
				service.archiveList({ listId: "lst_costco" }),
			).resolves.toEqual({
				status: "unchanged",
				list: result.list,
			});
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, "lst_costco"),
				}),
			).resolves.toMatchObject({
				archivedAt: result.list.archivedAt,
				updatedAt: result.list.updatedAt,
			});
			expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_archived", {
				household_id: "hh_avery",
				list_id: "lst_costco",
				user_id: "usr_avery",
			});
		} finally {
			await household.close();
		}
	});

	it("unarchives a List idempotently without timestamp churn when it is already active", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_100,
					archivedAt: 1_700_000_000_050,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			const result = await service.unarchiveList({ listId: "lst_costco" });
			expect(result).toMatchObject({
				status: "unarchived",
				list: {
					id: "lst_costco",
					archived: false,
					archivedAt: null,
					updatedAt: expect.any(Number),
				},
			});
			if (result.status !== "unarchived") {
				throw new Error("Expected unarchive to succeed");
			}
			expect(result.list.updatedAt).toBeGreaterThan(1_700_000_000_100);
			await expect(
				service.unarchiveList({ listId: "lst_costco" }),
			).resolves.toEqual({
				status: "unchanged",
				list: result.list,
			});
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, "lst_costco"),
				}),
			).resolves.toMatchObject({
				archivedAt: null,
				updatedAt: result.list.updatedAt,
			});
			expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_unarchived", {
				household_id: "hh_avery",
				list_id: "lst_costco",
				user_id: "usr_avery",
			});
		} finally {
			await household.close();
		}
	});

	it("returns missing and deleted lifecycle results for stale archive targets", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_deleted",
					name: "Deleted",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_150,
					deletedAt: 1_700_000_000_200,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.archiveList({ listId: "lst_missing" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
			});
			await expect(
				service.archiveList({ listId: "lst_deleted" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_deleted",
				deletedAt: 1_700_000_000_200,
				updatedAt: 1_700_000_000_150,
			});
			await expect(
				service.unarchiveList({ listId: "lst_missing" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
			});
			await expect(
				service.unarchiveList({ listId: "lst_deleted" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_deleted",
				deletedAt: 1_700_000_000_200,
				updatedAt: 1_700_000_000_150,
			});
			expect(analyticsMocks.track).not.toHaveBeenCalled();
		} finally {
			await household.close();
		}
	});

	it("deletes a List idempotently without timestamp churn when it is already deleted", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco",
					name: "Secret Shopping Name",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_100,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			const result = await service.deleteList({ listId: "lst_costco" });
			expect(result).toMatchObject({
				status: "deleted",
				listId: "lst_costco",
				deletedAt: expect.any(Number),
				updatedAt: expect.any(Number),
			});
			if (result.status !== "deleted") {
				throw new Error("Expected delete to succeed");
			}
			expect(result.deletedAt).toBeGreaterThan(1_700_000_000_100);
			await expect(
				service.deleteList({ listId: "lst_costco" }),
			).resolves.toEqual({
				status: "already-deleted",
				listId: "lst_costco",
				deletedAt: result.deletedAt,
				updatedAt: result.updatedAt,
			});
			await expect(
				household.db.query.lists.findFirst({
					where: (table, { eq }) => eq(table.id, "lst_costco"),
				}),
			).resolves.toMatchObject({
				deletedAt: result.deletedAt,
				updatedAt: result.deletedAt,
			});
			expect(analyticsMocks.track).toHaveBeenCalledTimes(1);
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_deleted", {
				household_id: "hh_avery",
				list_id: "lst_costco",
				user_id: "usr_avery",
			});
			expect(JSON.stringify(analyticsMocks.track.mock.calls)).not.toContain(
				"Secret Shopping Name",
			);
		} finally {
			await household.close();
		}
	});

	it("returns missing for stale delete targets without analytics", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.deleteList({ listId: "lst_missing" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalled();
		} finally {
			await household.close();
		}
	});

	it("emits list_renamed without user-content properties after changed rename", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_costco",
					name: "Costco",
					createdByUserId: "usr_avery",
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				authenticatedUserId: "usr_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.renameList({
					listId: "lst_costco",
					name: "Secret Shopping Name",
				}),
			).resolves.toMatchObject({ status: "renamed" });
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_renamed", {
				household_id: "hh_avery",
				list_id: "lst_costco",
				user_id: "usr_avery",
			});
			expect(JSON.stringify(analyticsMocks.track.mock.calls)).not.toContain(
				"Secret Shopping Name",
			);
		} finally {
			await household.close();
		}
	});
});

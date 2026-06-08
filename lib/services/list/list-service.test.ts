import { eq } from "drizzle-orm";

import { itemCheckFixture, itemFixture, listFixture } from "@/db/fixtures";
import {
	lists as householdLists,
	itemChecks,
	items,
	type NewItem,
	type NewItemCheck,
	type NewList,
} from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import type {
	HouseholdSqlResult,
	HouseholdSqlStatement,
} from "@/lib/services/household";
import { createMockLogger } from "@/lib/test/mocks/logger";

import { createListService } from "./list-service";

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
const householdId = "hh_avery";
const signedInUserId = "usr_signed_in";

beforeEach(() => {
	jest.restoreAllMocks();
	testLogger.debug.mockReset();
	testLogger.info.mockReset();
	testLogger.warn.mockReset();
	testLogger.error.mockReset();
	testLogger.with.mockClear();
	testLogger.with.mockReturnValue(testLogger);
});

describe("createListService", () => {
	it("creates a List locally with a trimmed name, creator User ID, archive defaults, and analytics", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_001_000);
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			const service = harness.service({ analytics });

			const result = await service.createList({
				name: "  Weekend   Groceries  ",
			});

			expect(result).toMatchObject({
				status: "available",
				didWrite: true,
				list: {
					id: expect.stringMatching(/^lst_/),
					householdId,
					name: "Weekend   Groceries",
					createdByUserId: signedInUserId,
					createdAt: 1_700_000_001_000,
					updatedAt: 1_700_000_001_000,
					archived: false,
					archivedAt: null,
				},
			});
			if (result.status !== "available")
				throw new Error("Expected created List");

			await expect(harness.findList(result.list.id)).resolves.toMatchObject({
				id: result.list.id,
				name: "Weekend   Groceries",
				createdByUserId: signedInUserId,
				createdAt: 1_700_000_001_000,
				updatedAt: 1_700_000_001_000,
				archivedAt: null,
				deletedAt: null,
			});
			expect(analytics.track).toHaveBeenCalledWith("list_created", {
				household_id: householdId,
				list_id: result.list.id,
				user_id: signedInUserId,
			});
		} finally {
			await harness.close();
		}
	});

	it("rejects invalid create names before writing or tracking analytics", async () => {
		const store = storeFixture();
		const analytics = analyticsFixture();
		const service = createListService({
			householdId,
			userId: signedInUserId,
			store,
			logger: testLogger,
			analytics,
		});

		await expect(service.createList({ name: "   " })).resolves.toEqual({
			status: "invalidName",
			reason: "required",
			didWrite: false,
		});
		await expect(service.createList({ name: "a".repeat(81) })).resolves.toEqual(
			{
				status: "invalidName",
				reason: "tooLong",
				didWrite: false,
			},
		);
		expect(store.execute).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("returns active and archived Lists as available", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_active",
					name: "Groceries",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_archived",
					name: "Camping",
					createdByUserId: "usr_blake",
					createdAt: 1_700_000_000_200,
					updatedAt: 1_700_000_000_300,
					archivedAt: 1_700_000_000_300,
				}),
			);

			await expect(
				harness.service().getList({ listId: "lst_active" }),
			).resolves.toEqual({
				status: "available",
				list: {
					id: "lst_active",
					householdId,
					name: "Groceries",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
					archived: false,
					archivedAt: null,
				},
			});
			await expect(
				harness.service().getList({ listId: "lst_archived" }),
			).resolves.toEqual({
				status: "available",
				list: expect.objectContaining({
					id: "lst_archived",
					name: "Camping",
					archived: true,
					archivedAt: 1_700_000_000_300,
				}),
			});
		} finally {
			await harness.close();
		}
	});

	it("returns typed deleted and missing List results", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_deleted",
					name: "Old List",
					updatedAt: 1_700_000_000_500,
					deletedAt: 1_700_000_000_400,
				}),
			);

			await expect(
				harness.service().getList({ listId: "lst_deleted" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_deleted",
				deletedAt: 1_700_000_000_400,
				updatedAt: 1_700_000_000_500,
			});
			await expect(
				harness.service().getList({ listId: "lst_missing" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
			});
		} finally {
			await harness.close();
		}
	});

	it("coerces string SQL timestamp columns when loading List metadata", async () => {
		const service = createListService({
			householdId,
			userId: signedInUserId,
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
						lastInsertRowId: null,
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

	it("lists active non-deleted List summaries by recent activity by default", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_active_old",
					name: "Pantry",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_active_recent",
					name: "Groceries",
					createdAt: 1_700_000_000_200,
					updatedAt: 1_700_000_000_500,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_archived",
					name: "Camping",
					createdAt: 1_700_000_000_300,
					updatedAt: 1_700_000_000_900,
					archivedAt: 1_700_000_000_900,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_deleted",
					name: "Deleted",
					createdAt: 1_700_000_000_400,
					updatedAt: 1_700_000_001_000,
					deletedAt: 1_700_000_001_000,
				}),
			);

			await expect(harness.service().listLists()).resolves.toEqual([
				{
					id: "lst_active_recent",
					householdId,
					name: "Groceries",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_200,
					updatedAt: 1_700_000_000_500,
					archived: false,
					archivedAt: null,
					lastActivityAt: 1_700_000_000_500,
					uncheckedItemCount: 0,
					checkedItemCount: 0,
				},
				expect.objectContaining({
					id: "lst_active_old",
					archived: false,
					lastActivityAt: 1_700_000_000_100,
				}),
			]);
		} finally {
			await harness.close();
		}
	});

	it("supports archived and all archive modes while excluding deleted Lists", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_active",
					name: "Active",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_archived",
					name: "Archived",
					createdAt: 1_700_000_000_200,
					updatedAt: 1_700_000_000_300,
					archivedAt: 1_700_000_000_300,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_deleted_archived",
					name: "Deleted Archived",
					createdAt: 1_700_000_000_400,
					updatedAt: 1_700_000_000_500,
					archivedAt: 1_700_000_000_450,
					deletedAt: 1_700_000_000_500,
				}),
			);

			await expect(
				harness.service().listLists({ archive: "archived" }),
			).resolves.toEqual([
				expect.objectContaining({
					id: "lst_archived",
					archived: true,
					archivedAt: 1_700_000_000_300,
				}),
			]);
			await expect(
				harness.service().listLists({ archive: "all" }),
			).resolves.toEqual([
				expect.objectContaining({ id: "lst_archived" }),
				expect.objectContaining({ id: "lst_active" }),
			]);
		} finally {
			await harness.close();
		}
	});

	it("filters List summaries by trimmed case-insensitive search with literal LIKE characters", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({ id: "lst_market", name: "Weekly MARKET" }),
			);
			await harness.insertList(
				listFixture({ id: "lst_percent", name: "50% off" }),
			);
			await harness.insertList(
				listFixture({ id: "lst_percent_control", name: "50X off" }),
			);
			await harness.insertList(
				listFixture({ id: "lst_underscore", name: "milk_tea" }),
			);
			await harness.insertList(
				listFixture({ id: "lst_underscore_control", name: "milkXtea" }),
			);

			await expect(
				harness.service().listLists({ searchText: " market " }),
			).resolves.toEqual([expect.objectContaining({ id: "lst_market" })]);
			await expect(
				harness.service().listLists({ searchText: "%" }),
			).resolves.toEqual([expect.objectContaining({ id: "lst_percent" })]);
			await expect(
				harness.service().listLists({ searchText: "_" }),
			).resolves.toEqual([expect.objectContaining({ id: "lst_underscore" })]);
			await expect(
				harness.service().listLists({ searchText: "   " }),
			).resolves.toHaveLength(5);
		} finally {
			await harness.close();
		}
	});

	it("filters List summaries by creator User ID without directory reads", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_avery",
					name: "Avery",
					createdByUserId: "usr_avery",
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_blake",
					name: "Blake",
					createdByUserId: "usr_blake",
					updatedAt: 1_700_000_000_200,
				}),
			);

			await expect(
				harness.service().listLists({ createdByUserId: "usr_blake" }),
			).resolves.toEqual([
				expect.objectContaining({
					id: "lst_blake",
					createdByUserId: "usr_blake",
				}),
			]);
		} finally {
			await harness.close();
		}
	});

	it("counts checked and unchecked Items using latest check row tie semantics", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_counts",
					name: "Counts",
					updatedAt: 1_700_000_000_000,
				}),
			);
			await harness.insertItems([
				itemFixture({
					id: "itm_no_check",
					listId: "lst_counts",
					updatedAt: 1_700_000_000_010,
				}),
				itemFixture({
					id: "itm_checked",
					listId: "lst_counts",
					updatedAt: 1_700_000_000_020,
				}),
				itemFixture({
					id: "itm_unchecked_latest",
					listId: "lst_counts",
					updatedAt: 1_700_000_000_030,
				}),
				itemFixture({
					id: "itm_tie_checked",
					listId: "lst_counts",
					updatedAt: 1_700_000_000_040,
				}),
			]);
			await harness.insertItemChecks([
				itemCheckFixture({
					itemId: "itm_checked",
					userId: "usr_avery",
					checkedAt: 1_700_000_000_100,
					updatedAt: 1_700_000_000_100,
				}),
				itemCheckFixture({
					itemId: "itm_checked",
					userId: "usr_blake",
					checkedAt: null,
					updatedAt: 1_700_000_000_090,
				}),
				itemCheckFixture({
					itemId: "itm_unchecked_latest",
					userId: "usr_avery",
					checkedAt: 1_700_000_000_100,
					updatedAt: 1_700_000_000_100,
				}),
				itemCheckFixture({
					itemId: "itm_unchecked_latest",
					userId: "usr_blake",
					checkedAt: null,
					updatedAt: 1_700_000_000_110,
				}),
				itemCheckFixture({
					itemId: "itm_tie_checked",
					userId: "usr_avery",
					checkedAt: null,
					updatedAt: 1_700_000_000_120,
				}),
				itemCheckFixture({
					itemId: "itm_tie_checked",
					userId: "usr_blake",
					checkedAt: 1_700_000_000_120,
					updatedAt: 1_700_000_000_120,
				}),
			]);

			await expect(harness.service().listLists()).resolves.toEqual([
				expect.objectContaining({
					id: "lst_counts",
					uncheckedItemCount: 2,
					checkedItemCount: 2,
					lastActivityAt: 1_700_000_000_120,
				}),
			]);
		} finally {
			await harness.close();
		}
	});

	it("excludes tombstoned Items from counts and last activity", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_tombstones",
					name: "Tombstones",
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertItem(
				itemFixture({
					id: "itm_deleted",
					listId: "lst_tombstones",
					updatedAt: 1_700_000_000_500,
					deletedAt: 1_700_000_000_550,
				}),
			);
			await harness.insertItemCheck(
				itemCheckFixture({
					itemId: "itm_deleted",
					userId: "usr_avery",
					checkedAt: 1_700_000_000_600,
					updatedAt: 1_700_000_000_600,
				}),
			);

			await expect(harness.service().listLists()).resolves.toEqual([
				expect.objectContaining({
					id: "lst_tombstones",
					uncheckedItemCount: 0,
					checkedItemCount: 0,
					lastActivityAt: 1_700_000_000_100,
				}),
			]);
		} finally {
			await harness.close();
		}
	});

	it("sorts recent activity from List, Item, and check timestamps with tie-breakers", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_list_activity",
					name: "List",
					createdAt: 1_700_000_000_100,
					updatedAt: 1_700_000_000_300,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_item_activity",
					name: "Item",
					createdAt: 1_700_000_000_200,
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_check_activity",
					name: "Check",
					createdAt: 1_700_000_000_300,
					updatedAt: 1_700_000_000_100,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_tie_a",
					name: "Tie A",
					createdAt: 1_700_000_000_050,
					updatedAt: 1_700_000_000_300,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_tie_b",
					name: "Tie B",
					createdAt: 1_700_000_000_100,
					updatedAt: 1_700_000_000_300,
				}),
			);
			await harness.insertItem(
				itemFixture({
					id: "itm_recent",
					listId: "lst_item_activity",
					updatedAt: 1_700_000_000_500,
				}),
			);
			await harness.insertItem(
				itemFixture({
					id: "itm_checked_recent",
					listId: "lst_check_activity",
					updatedAt: 1_700_000_000_200,
				}),
			);
			await harness.insertItemCheck(
				itemCheckFixture({
					itemId: "itm_checked_recent",
					updatedAt: 1_700_000_000_700,
					checkedAt: 1_700_000_000_700,
				}),
			);

			await expect(
				harness.service().listLists({ sort: "recentActivity" }),
			).resolves.toEqual([
				expect.objectContaining({
					id: "lst_check_activity",
					lastActivityAt: 1_700_000_000_700,
				}),
				expect.objectContaining({
					id: "lst_item_activity",
					lastActivityAt: 1_700_000_000_500,
				}),
				expect.objectContaining({ id: "lst_tie_a" }),
				expect.objectContaining({ id: "lst_list_activity" }),
				expect.objectContaining({ id: "lst_tie_b" }),
			]);
		} finally {
			await harness.close();
		}
	});

	it("sorts by name and createdAt with documented tie-breakers", async () => {
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_banana",
					name: "banana",
					createdAt: 1_700_000_000_300,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_apple_later",
					name: "Apple",
					createdAt: 1_700_000_000_500,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_apple_b",
					name: "apple",
					createdAt: 1_700_000_000_400,
				}),
			);
			await harness.insertList(
				listFixture({
					id: "lst_apple_a",
					name: "apple",
					createdAt: 1_700_000_000_400,
				}),
			);

			await expect(
				harness.service().listLists({ sort: "name" }),
			).resolves.toEqual([
				expect.objectContaining({ id: "lst_apple_a" }),
				expect.objectContaining({ id: "lst_apple_b" }),
				expect.objectContaining({ id: "lst_apple_later" }),
				expect.objectContaining({ id: "lst_banana" }),
			]);
			await expect(
				harness.service().listLists({ sort: "createdAt" }),
			).resolves.toEqual([
				expect.objectContaining({ id: "lst_apple_later" }),
				expect.objectContaining({ id: "lst_apple_a" }),
				expect.objectContaining({ id: "lst_apple_b" }),
				expect.objectContaining({ id: "lst_banana" }),
			]);
		} finally {
			await harness.close();
		}
	});

	it("renames an active List after validation and tracks only successful writes", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_010_000);
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_rename",
					name: "Groceries",
					updatedAt: 1_700_000_000_000,
				}),
			);

			await expect(
				harness.service({ analytics }).renameList({
					listId: "lst_rename",
					name: "  Weekend   Groceries  ",
				}),
			).resolves.toEqual({
				status: "available",
				didWrite: true,
				list: expect.objectContaining({
					id: "lst_rename",
					name: "Weekend   Groceries",
					updatedAt: 1_700_000_010_000,
				}),
			});
			await expect(harness.findList("lst_rename")).resolves.toMatchObject({
				name: "Weekend   Groceries",
				updatedAt: 1_700_000_010_000,
			});
			expect(analytics.track).toHaveBeenCalledWith("list_renamed", {
				household_id: householdId,
				list_id: "lst_rename",
				user_id: signedInUserId,
			});
		} finally {
			await harness.close();
		}
	});

	it("renames archived non-deleted Lists", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_020_000);
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_archived_rename",
					name: "Camping",
					archivedAt: 1_700_000_000_000,
				}),
			);

			await expect(
				harness.service().renameList({
					listId: "lst_archived_rename",
					name: "Camp Food",
				}),
			).resolves.toEqual({
				status: "available",
				didWrite: true,
				list: expect.objectContaining({
					id: "lst_archived_rename",
					name: "Camp Food",
					archived: true,
					archivedAt: 1_700_000_000_000,
					updatedAt: 1_700_000_020_000,
				}),
			});
		} finally {
			await harness.close();
		}
	});

	it("does not churn timestamps or analytics when rename keeps the same trimmed name", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_030_000);
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_same_name",
					name: "Groceries",
					updatedAt: 1_700_000_000_000,
				}),
			);

			await expect(
				harness.service({ analytics }).renameList({
					listId: "lst_same_name",
					name: "  Groceries  ",
				}),
			).resolves.toEqual({
				status: "available",
				didWrite: false,
				list: expect.objectContaining({
					id: "lst_same_name",
					name: "Groceries",
					updatedAt: 1_700_000_000_000,
				}),
			});
			await expect(harness.findList("lst_same_name")).resolves.toMatchObject({
				updatedAt: 1_700_000_000_000,
			});
			expect(analytics.track).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("returns the reread deleted result when a rename guarded update affects no rows", async () => {
		const store = storeFixture();
		const analytics = analyticsFixture();
		store.execute
			.mockResolvedValueOnce({
				rows: [listRow({ id: "lst_rename_race", name: "Groceries" })],
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
					listRow({
						id: "lst_rename_race",
						name: "Groceries",
						updated_at: 1_700_000_000_500,
						deleted_at: 1_700_000_000_400,
					}),
				],
				rowsAffected: 0,
				lastInsertRowId: null,
			});
		const service = createListService({
			householdId,
			userId: signedInUserId,
			store,
			logger: testLogger,
			analytics,
		});

		await expect(
			service.renameList({
				listId: "lst_rename_race",
				name: "Weekend Groceries",
			}),
		).resolves.toEqual({
			status: "deleted",
			listId: "lst_rename_race",
			deletedAt: 1_700_000_000_400,
			updatedAt: 1_700_000_000_500,
			didWrite: false,
		});
		expect(store.execute).toHaveBeenCalledTimes(3);
		expect(store.execute.mock.calls[1]?.[0]).toMatchObject({ kind: "write" });
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("returns typed rename results for invalid, deleted, and missing Lists without writes", async () => {
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_deleted_rename",
					name: "Deleted",
					updatedAt: 1_700_000_000_200,
					deletedAt: 1_700_000_000_100,
				}),
			);
			const service = harness.service({ analytics });

			await expect(
				service.renameList({ listId: "lst_deleted_rename", name: "   " }),
			).resolves.toEqual({
				status: "invalidName",
				reason: "required",
				didWrite: false,
			});
			await expect(
				service.renameList({
					listId: "lst_deleted_rename",
					name: "a".repeat(81),
				}),
			).resolves.toEqual({
				status: "invalidName",
				reason: "tooLong",
				didWrite: false,
			});
			await expect(
				service.renameList({ listId: "lst_deleted_rename", name: "New Name" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_deleted_rename",
				deletedAt: 1_700_000_000_100,
				updatedAt: 1_700_000_000_200,
				didWrite: false,
			});
			await expect(
				service.renameList({ listId: "lst_missing", name: "New Name" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
				didWrite: false,
			});
			expect(analytics.track).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("soft-deletes active Lists without hard-deleting Items and tracks the write", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_040_000);
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_delete",
					name: "Groceries",
					updatedAt: 1_700_000_000_000,
				}),
			);
			await harness.db.insert(items).values(
				itemFixture({
					id: "itm_keep",
					listId: "lst_delete",
				}),
			);

			await expect(
				harness.service({ analytics }).deleteList({ listId: "lst_delete" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_delete",
				deletedAt: 1_700_000_040_000,
				updatedAt: 1_700_000_040_000,
				didWrite: true,
			});
			await expect(harness.findList("lst_delete")).resolves.toMatchObject({
				id: "lst_delete",
				deletedAt: 1_700_000_040_000,
				updatedAt: 1_700_000_040_000,
			});
			await expect(
				harness.db.query.items.findFirst({ where: eq(items.id, "itm_keep") }),
			).resolves.toMatchObject({ id: "itm_keep", listId: "lst_delete" });
			expect(analytics.track).toHaveBeenCalledWith("list_deleted", {
				household_id: householdId,
				list_id: "lst_delete",
				user_id: signedInUserId,
			});
		} finally {
			await harness.close();
		}
	});

	it("returns the reread missing result when a delete guarded update affects no rows", async () => {
		const store = storeFixture();
		const analytics = analyticsFixture();
		store.execute
			.mockResolvedValueOnce({
				rows: [listRow({ id: "lst_delete_race", name: "Groceries" })],
				rowsAffected: 0,
				lastInsertRowId: null,
			})
			.mockResolvedValueOnce({
				rows: [],
				rowsAffected: 0,
				lastInsertRowId: null,
			})
			.mockResolvedValueOnce({
				rows: [],
				rowsAffected: 0,
				lastInsertRowId: null,
			});
		const service = createListService({
			householdId,
			userId: signedInUserId,
			store,
			logger: testLogger,
			analytics,
		});

		await expect(
			service.deleteList({ listId: "lst_delete_race" }),
		).resolves.toEqual({
			status: "missing",
			listId: "lst_delete_race",
			didWrite: false,
		});
		expect(store.execute).toHaveBeenCalledTimes(3);
		expect(store.execute.mock.calls[1]?.[0]).toMatchObject({ kind: "write" });
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("soft-deletes archived non-deleted Lists", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_050_000);
		const harness = await createHarness();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_archived_delete",
					name: "Camping",
					archivedAt: 1_700_000_000_000,
				}),
			);

			await expect(
				harness.service().deleteList({ listId: "lst_archived_delete" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_archived_delete",
				deletedAt: 1_700_000_050_000,
				updatedAt: 1_700_000_050_000,
				didWrite: true,
			});
		} finally {
			await harness.close();
		}
	});

	it("does not churn timestamps or analytics when deleting an already deleted List", async () => {
		jest.spyOn(Date, "now").mockReturnValue(1_700_000_060_000);
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			await harness.insertList(
				listFixture({
					id: "lst_already_deleted",
					name: "Old",
					updatedAt: 1_700_000_000_200,
					deletedAt: 1_700_000_000_100,
				}),
			);

			await expect(
				harness
					.service({ analytics })
					.deleteList({ listId: "lst_already_deleted" }),
			).resolves.toEqual({
				status: "deleted",
				listId: "lst_already_deleted",
				deletedAt: 1_700_000_000_100,
				updatedAt: 1_700_000_000_200,
				didWrite: false,
			});
			await expect(
				harness.findList("lst_already_deleted"),
			).resolves.toMatchObject({
				deletedAt: 1_700_000_000_100,
				updatedAt: 1_700_000_000_200,
			});
			expect(analytics.track).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("returns missing when deleting a missing List without analytics", async () => {
		const harness = await createHarness();
		const analytics = analyticsFixture();

		try {
			await expect(
				harness.service({ analytics }).deleteList({ listId: "lst_missing" }),
			).resolves.toEqual({
				status: "missing",
				listId: "lst_missing",
				didWrite: false,
			});
			expect(analytics.track).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});
});

async function createHarness() {
	const household = await createTestHouseholdDb();

	return {
		db: household.db,
		service(options: { analytics?: ServiceAnalytics } = {}) {
			return createListService({
				householdId,
				userId: signedInUserId,
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
				analytics: options.analytics,
			});
		},
		insertList(value: NewList) {
			return household.db.insert(householdLists).values(value);
		},
		insertItem(value: NewItem) {
			return household.db.insert(items).values(value);
		},
		insertItems(values: NewItem[]) {
			return household.db.insert(items).values(values);
		},
		insertItemCheck(value: NewItemCheck) {
			return household.db.insert(itemChecks).values(value);
		},
		insertItemChecks(values: NewItemCheck[]) {
			return household.db.insert(itemChecks).values(values);
		},
		findList(listId: string) {
			return household.db.query.lists.findFirst({
				where: eq(householdLists.id, listId),
			});
		},
		close: household.close,
	};
}

function analyticsFixture(): ServiceAnalytics & {
	track: jest.Mock;
} {
	return {
		track: jest.fn(),
	};
}

function storeFixture() {
	return {
		execute: jest.fn<Promise<HouseholdSqlResult>, [HouseholdSqlStatement]>(
			async () => ({ rows: [], rowsAffected: 0, lastInsertRowId: null }),
		),
	};
}

function listRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "lst_fixture",
		name: "Groceries",
		created_by_user_id: "usr_avery",
		created_at: 1_700_000_000_000,
		updated_at: 1_700_000_000_100,
		archived_at: null,
		deleted_at: null,
		...overrides,
	};
}

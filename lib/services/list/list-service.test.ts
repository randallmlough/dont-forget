import { eq } from "drizzle-orm";

import {
	itemCheckFixture,
	itemFixture,
	listFixture,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { itemChecks, items, lists } from "@/db/schema/household";
import {
	createTestDirectoryDb,
	createTestHouseholdDb,
	type TestHouseholdDb,
} from "@/db/test";
import type { HouseholdSqlStatement } from "@/lib/services/household";
import {
	createMockAnalytics,
	type MockAnalytics,
} from "@/lib/test/mocks/analytics";
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
testLogger.with.mockReturnValue(testLogger);

beforeEach(() => {
	testLogger.debug.mockReset();
	testLogger.info.mockReset();
	testLogger.warn.mockReset();
	testLogger.error.mockReset();
	testLogger.with.mockClear();
	testLogger.with.mockReturnValue(testLogger);
});

function serviceFor(
	household: TestHouseholdDb,
	options: { analytics?: MockAnalytics; failWrites?: boolean } = {},
) {
	const execute = household.client.execute.bind(household.client);
	return createListService({
		householdId: "hh_avery",
		userId: "usr_avery",
		store: {
			async execute(statement: HouseholdSqlStatement) {
				if (options.failWrites && statement.kind === "write") {
					throw new Error("injected write failure");
				}
				return execute(statement);
			},
		},
		logger: testLogger,
		analytics: options.analytics,
	});
}

describe("createListService", () => {
	describe("getList", () => {
		it("returns an active List as available", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

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

		it("returns an archived non-deleted List as available with archive metadata", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				await expect(
					service.getList({ listId: scenario.lists.archived.id }),
				).resolves.toEqual({
					status: "available",
					list: {
						id: scenario.lists.archived.id,
						householdId: scenario.household.id,
						name: scenario.lists.archived.name,
						createdByUserId: scenario.users.avery.id,
						createdAt: scenario.lists.archived.createdAt,
						updatedAt: scenario.lists.archived.updatedAt,
						archived: true,
						archivedAt: scenario.lists.archived.archivedAt,
					},
				});
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("returns a typed deleted result for a soft-deleted List", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				await expect(
					service.getList({ listId: scenario.lists.deleted.id }),
				).resolves.toEqual({
					status: "deleted",
					listId: scenario.lists.deleted.id,
					deletedAt: scenario.lists.deleted.deletedAt,
					updatedAt: scenario.lists.deleted.updatedAt,
				});
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("returns a typed missing result for an unknown List", async () => {
			const household = await createTestHouseholdDb();

			try {
				const service = serviceFor(household);

				await expect(
					service.getList({ listId: "lst_missing" }),
				).resolves.toEqual({
					status: "missing",
					listId: "lst_missing",
				});
			} finally {
				await household.close();
			}
		});

		it("classifies a List with both archived_at and deleted_at as deleted across getList, renameList, and deleteList", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_both",
						name: "Archived Then Deleted",
						createdAt: 100,
						updatedAt: 700,
						archivedAt: 600,
						deletedAt: 700,
					}),
				);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(service.getList({ listId: "lst_both" })).resolves.toEqual({
					status: "deleted",
					listId: "lst_both",
					deletedAt: 700,
					updatedAt: 700,
				});
				await expect(
					service.renameList({ listId: "lst_both", name: "New Name" }),
				).resolves.toEqual({
					status: "deleted",
					listId: "lst_both",
					deletedAt: 700,
					updatedAt: 700,
					didWrite: false,
				});
				await expect(
					service.deleteList({ listId: "lst_both" }),
				).resolves.toEqual({
					status: "deleted",
					listId: "lst_both",
					deletedAt: 700,
					updatedAt: 700,
					didWrite: false,
				});
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("coerces string SQL timestamp columns when loading List metadata", async () => {
			const service = createListService({
				householdId: "hh_avery",
				userId: "usr_avery",
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
									archived_at: "1700000000100",
									deleted_at: null,
								},
							],
						};
					},
				},
				logger: testLogger,
			});

			await expect(service.getList({ listId: "lst_weekend" })).resolves.toEqual(
				{
					status: "available",
					list: expect.objectContaining({
						createdAt: 1_700_000_000_000,
						updatedAt: 1_700_000_000_100,
						archived: true,
						archivedAt: 1_700_000_000_100,
					}),
				},
			);
		});
	});

	describe("createList", () => {
		it("creates a List with a trimmed name attributed to the captured userId", async () => {
			const household = await createTestHouseholdDb();

			try {
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				const result = await service.createList({ name: "  Weekend   Trip  " });
				if (result.status !== "available") {
					throw new Error(`Expected available, got ${result.status}`);
				}

				expect(result.didWrite).toBe(true);
				expect(result.list).toEqual({
					id: expect.stringMatching(/^lst_/),
					householdId: "hh_avery",
					name: "Weekend   Trip",
					createdByUserId: "usr_avery",
					createdAt: result.list.createdAt,
					updatedAt: result.list.createdAt,
					archived: false,
					archivedAt: null,
				});
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, result.list.id),
					}),
				).resolves.toMatchObject({
					name: "Weekend   Trip",
					createdByUserId: "usr_avery",
					createdAt: result.list.createdAt,
					updatedAt: result.list.updatedAt,
					archivedAt: null,
					deletedAt: null,
				});
				expect(analytics.track).toHaveBeenCalledTimes(1);
				expect(analytics.track).toHaveBeenCalledWith("list_created", {
					household_id: "hh_avery",
					list_id: result.list.id,
					user_id: "usr_avery",
				});
			} finally {
				await household.close();
			}
		});

		it("rejects an empty or whitespace-only name without writing", async () => {
			const household = await createTestHouseholdDb();

			try {
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(service.createList({ name: "   " })).resolves.toEqual({
					status: "invalidName",
					reason: "required",
					didWrite: false,
				});
				await expect(household.db.query.lists.findMany()).resolves.toEqual([]);
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("rejects names over 80 characters but allows exactly 80 after trimming", async () => {
			const household = await createTestHouseholdDb();

			try {
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.createList({ name: "x".repeat(81) }),
				).resolves.toEqual({
					status: "invalidName",
					reason: "tooLong",
					didWrite: false,
				});
				expect(analytics.track).not.toHaveBeenCalled();

				await expect(
					service.createList({ name: `  ${"x".repeat(80)}  ` }),
				).resolves.toMatchObject({
					status: "available",
					didWrite: true,
				});
			} finally {
				await household.close();
			}
		});

		it("allows duplicate List names", async () => {
			const household = await createTestHouseholdDb();

			try {
				const service = serviceFor(household, {
					analytics: createMockAnalytics(),
				});

				const first = await service.createList({ name: "Groceries" });
				const second = await service.createList({ name: "Groceries" });
				if (first.status !== "available" || second.status !== "available") {
					throw new Error("Expected both creates to be available");
				}

				expect(first.list.id).not.toBe(second.list.id);
				expect(second.list.name).toBe("Groceries");
			} finally {
				await household.close();
			}
		});

		it("rethrows a failed insert without emitting analytics", async () => {
			const household = await createTestHouseholdDb();

			try {
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics, failWrites: true });

				await expect(service.createList({ name: "Weekend" })).rejects.toThrow(
					"injected write failure",
				);
				await expect(household.db.query.lists.findMany()).resolves.toEqual([]);
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});
	});

	describe("renameList", () => {
		it("renames an active List and bumps updated_at", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_weekend",
						name: "Weekend",
						createdAt: 100,
						updatedAt: 100,
					}),
				);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				const result = await service.renameList({
					listId: "lst_weekend",
					name: "  Weekend   Trip  ",
				});
				if (result.status !== "available") {
					throw new Error(`Expected available, got ${result.status}`);
				}

				expect(result.didWrite).toBe(true);
				expect(result.list.name).toBe("Weekend   Trip");
				expect(result.list.updatedAt).toBeGreaterThan(100);
				expect(result.list.createdAt).toBe(100);
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_weekend"),
					}),
				).resolves.toMatchObject({
					name: "Weekend   Trip",
					createdAt: 100,
					updatedAt: result.list.updatedAt,
				});
				expect(analytics.track).toHaveBeenCalledTimes(1);
				expect(analytics.track).toHaveBeenCalledWith("list_renamed", {
					household_id: "hh_avery",
					list_id: "lst_weekend",
					user_id: "usr_avery",
				});
			} finally {
				await household.close();
			}
		});

		it("renames an archived non-deleted List", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_holiday",
						name: "Holiday Dinner",
						createdAt: 100,
						updatedAt: 200,
						archivedAt: 200,
					}),
				);
				const service = serviceFor(household, {
					analytics: createMockAnalytics(),
				});

				await expect(
					service.renameList({ listId: "lst_holiday", name: "Holiday Feast" }),
				).resolves.toMatchObject({
					status: "available",
					didWrite: true,
					list: expect.objectContaining({
						name: "Holiday Feast",
						archived: true,
						archivedAt: 200,
					}),
				});
			} finally {
				await household.close();
			}
		});

		it("returns available without writing when renaming to the existing trimmed name", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_weekend",
						name: "Weekend Trip",
						createdAt: 100,
						updatedAt: 100,
					}),
				);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.renameList({
						listId: "lst_weekend",
						name: "  Weekend Trip  ",
					}),
				).resolves.toEqual({
					status: "available",
					didWrite: false,
					list: expect.objectContaining({
						name: "Weekend Trip",
						updatedAt: 100,
					}),
				});
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_weekend"),
					}),
				).resolves.toMatchObject({ updatedAt: 100 });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("applies name validation before any write", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db
					.insert(lists)
					.values(
						listFixture({ id: "lst_weekend", name: "Weekend", updatedAt: 100 }),
					);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.renameList({ listId: "lst_weekend", name: "   " }),
				).resolves.toEqual({
					status: "invalidName",
					reason: "required",
					didWrite: false,
				});
				await expect(
					service.renameList({ listId: "lst_weekend", name: "x".repeat(81) }),
				).resolves.toEqual({
					status: "invalidName",
					reason: "tooLong",
					didWrite: false,
				});
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_weekend"),
					}),
				).resolves.toMatchObject({ name: "Weekend", updatedAt: 100 });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("returns deleted without writing for a soft-deleted List", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_camping",
						name: "Camping Trip",
						updatedAt: 555,
						deletedAt: 555,
					}),
				);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.renameList({ listId: "lst_camping", name: "Road Trip" }),
				).resolves.toEqual({
					status: "deleted",
					listId: "lst_camping",
					deletedAt: 555,
					updatedAt: 555,
					didWrite: false,
				});
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_camping"),
					}),
				).resolves.toMatchObject({ name: "Camping Trip", updatedAt: 555 });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("returns missing for an unknown List", async () => {
			const household = await createTestHouseholdDb();

			try {
				const service = serviceFor(household, {
					analytics: createMockAnalytics(),
				});

				await expect(
					service.renameList({ listId: "lst_missing", name: "Anything" }),
				).resolves.toEqual({
					status: "missing",
					listId: "lst_missing",
					didWrite: false,
				});
			} finally {
				await household.close();
			}
		});

		it("does not emit analytics when renaming a missing List", async () => {
			const household = await createTestHouseholdDb();

			try {
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.renameList({ listId: "lst_missing", name: "Anything" }),
				).resolves.toMatchObject({ status: "missing" });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("rethrows a failed rename write without emitting analytics", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db
					.insert(lists)
					.values(
						listFixture({ id: "lst_weekend", name: "Weekend", updatedAt: 100 }),
					);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics, failWrites: true });

				await expect(
					service.renameList({ listId: "lst_weekend", name: "Weekend Trip" }),
				).rejects.toThrow("injected write failure");
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_weekend"),
					}),
				).resolves.toMatchObject({ name: "Weekend", updatedAt: 100 });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});
	});

	describe("deleteList", () => {
		it("soft-deletes an active List without touching its Items", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db
					.insert(lists)
					.values(
						listFixture({ id: "lst_weekend", name: "Weekend", updatedAt: 100 }),
					);
				await household.db
					.insert(items)
					.values(itemFixture({ id: "itm_milk", listId: "lst_weekend" }));
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				const result = await service.deleteList({ listId: "lst_weekend" });
				if (result.status !== "deleted") {
					throw new Error(`Expected deleted, got ${result.status}`);
				}

				expect(result.didWrite).toBe(true);
				expect(result.updatedAt).toBe(result.deletedAt);
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_weekend"),
					}),
				).resolves.toMatchObject({
					deletedAt: result.deletedAt,
					updatedAt: result.deletedAt,
				});
				await expect(
					household.db.query.items.findFirst({
						where: eq(items.id, "itm_milk"),
					}),
				).resolves.toMatchObject({ deletedAt: null });
				expect(analytics.track).toHaveBeenCalledTimes(1);
				expect(analytics.track).toHaveBeenCalledWith("list_deleted", {
					household_id: "hh_avery",
					list_id: "lst_weekend",
					user_id: "usr_avery",
				});
			} finally {
				await household.close();
			}
		});

		it("soft-deletes an archived non-deleted List", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_holiday",
						name: "Holiday Dinner",
						updatedAt: 200,
						archivedAt: 200,
					}),
				);
				const service = serviceFor(household, {
					analytics: createMockAnalytics(),
				});

				await expect(
					service.deleteList({ listId: "lst_holiday" }),
				).resolves.toMatchObject({
					status: "deleted",
					listId: "lst_holiday",
					didWrite: true,
				});
			} finally {
				await household.close();
			}
		});

		it("returns deleted without churning timestamps for an already deleted List", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_camping",
						name: "Camping Trip",
						updatedAt: 555,
						deletedAt: 555,
					}),
				);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.deleteList({ listId: "lst_camping" }),
				).resolves.toEqual({
					status: "deleted",
					listId: "lst_camping",
					deletedAt: 555,
					updatedAt: 555,
					didWrite: false,
				});
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_camping"),
					}),
				).resolves.toMatchObject({ deletedAt: 555, updatedAt: 555 });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("returns missing for an unknown List", async () => {
			const household = await createTestHouseholdDb();

			try {
				const service = serviceFor(household, {
					analytics: createMockAnalytics(),
				});

				await expect(
					service.deleteList({ listId: "lst_missing" }),
				).resolves.toEqual({
					status: "missing",
					listId: "lst_missing",
					didWrite: false,
				});
			} finally {
				await household.close();
			}
		});

		it("does not emit analytics when deleting a missing List", async () => {
			const household = await createTestHouseholdDb();

			try {
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics });

				await expect(
					service.deleteList({ listId: "lst_missing" }),
				).resolves.toMatchObject({ status: "missing" });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});

		it("rethrows a failed delete write without emitting analytics", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db
					.insert(lists)
					.values(
						listFixture({ id: "lst_weekend", name: "Weekend", updatedAt: 100 }),
					);
				const analytics = createMockAnalytics();
				const service = serviceFor(household, { analytics, failWrites: true });

				await expect(
					service.deleteList({ listId: "lst_weekend" }),
				).rejects.toThrow("injected write failure");
				await expect(
					household.db.query.lists.findFirst({
						where: eq(lists.id, "lst_weekend"),
					}),
				).resolves.toMatchObject({ deletedAt: null, updatedAt: 100 });
				expect(analytics.track).not.toHaveBeenCalled();
			} finally {
				await household.close();
			}
		});
	});

	describe("listLists", () => {
		const now = 1_700_000_000_000;

		it("returns active non-deleted Lists as summaries sorted by recent activity by default", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				const summaries = await service.listLists();

				expect(summaries).toEqual([
					{
						id: scenario.lists.groceries.id,
						householdId: scenario.household.id,
						name: scenario.lists.groceries.name,
						createdByUserId: scenario.users.avery.id,
						createdAt: now,
						updatedAt: now,
						archived: false,
						archivedAt: null,
						lastActivityAt: now + 110,
						uncheckedItemCount: 1,
						checkedItemCount: 2,
					},
					{
						id: scenario.lists.pharmacy.id,
						householdId: scenario.household.id,
						name: scenario.lists.pharmacy.name,
						createdByUserId: scenario.users.blake.id,
						createdAt: now + 2,
						updatedAt: now + 2,
						archived: false,
						archivedAt: null,
						lastActivityAt: now + 2,
						uncheckedItemCount: 0,
						checkedItemCount: 0,
					},
					{
						id: scenario.lists.hardware.id,
						householdId: scenario.household.id,
						name: scenario.lists.hardware.name,
						createdByUserId: scenario.users.avery.id,
						createdAt: now + 1,
						updatedAt: now + 1,
						archived: false,
						archivedAt: null,
						lastActivityAt: now + 1,
						uncheckedItemCount: 0,
						checkedItemCount: 0,
					},
				]);
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("returns only archived non-deleted Lists for archive: archived", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				await expect(
					service.listLists({ archive: "archived" }),
				).resolves.toEqual([
					{
						id: scenario.lists.archived.id,
						householdId: scenario.household.id,
						name: scenario.lists.archived.name,
						createdByUserId: scenario.users.avery.id,
						createdAt: now + 3,
						updatedAt: now + 60,
						archived: true,
						archivedAt: now + 60,
						lastActivityAt: now + 60,
						uncheckedItemCount: 0,
						checkedItemCount: 0,
					},
				]);
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("returns active plus archived Lists for archive: all while excluding deleted Lists", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				const summaries = await service.listLists({ archive: "all" });

				expect(summaries.map((summary) => summary.id)).toEqual([
					scenario.lists.groceries.id,
					scenario.lists.archived.id,
					scenario.lists.pharmacy.id,
					scenario.lists.hardware.id,
				]);
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("matches List names case-insensitively with trimmed search text", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				const summaries = await service.listLists({ searchText: "  GROC  " });

				expect(summaries.map((summary) => summary.id)).toEqual([
					scenario.lists.groceries.id,
				]);
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("applies no search filter for empty or whitespace-only search text", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				await expect(
					service.listLists({ searchText: "   " }),
				).resolves.toHaveLength(3);
				await expect(
					service.listLists({ searchText: "" }),
				).resolves.toHaveLength(3);
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("treats literal % and _ in search text as plain characters", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db
					.insert(lists)
					.values([
						listFixture({ id: "lst_percent", name: "100% Juice" }),
						listFixture({ id: "lst_x", name: "100x Juice" }),
						listFixture({ id: "lst_underscore", name: "a_b" }),
						listFixture({ id: "lst_axb", name: "axb" }),
					]);
				const service = serviceFor(household);

				const percentMatches = await service.listLists({
					searchText: "100%",
				});
				expect(percentMatches.map((summary) => summary.id)).toEqual([
					"lst_percent",
				]);

				const underscoreMatches = await service.listLists({
					searchText: "a_b",
				});
				expect(underscoreMatches.map((summary) => summary.id)).toEqual([
					"lst_underscore",
				]);
			} finally {
				await household.close();
			}
		});

		it("filters by created_by_user_id", async () => {
			const directory = await createTestDirectoryDb();
			const household = await createTestHouseholdDb();

			try {
				const scenario = await seedPrimaryHouseholdScenario({
					directory: directory.db,
					household: household.db,
				});
				const service = serviceFor(household);

				const summaries = await service.listLists({
					createdByUserId: scenario.users.blake.id,
				});

				expect(summaries.map((summary) => summary.id)).toEqual([
					scenario.lists.pharmacy.id,
				]);
			} finally {
				await directory.close();
				await household.close();
			}
		});

		it("classifies checked state from the latest check row by updated_at DESC, user_id DESC", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_tie",
						name: "Ties",
						createdAt: 100,
						updatedAt: 100,
					}),
				);
				await household.db.insert(items).values([
					itemFixture({
						id: "itm_tie_unchecked",
						listId: "lst_tie",
						name: "Tie Unchecked",
						position: 0,
						createdAt: 100,
						updatedAt: 100,
					}),
					itemFixture({
						id: "itm_tie_checked",
						listId: "lst_tie",
						name: "Tie Checked",
						position: 1,
						createdAt: 100,
						updatedAt: 100,
					}),
					itemFixture({
						id: "itm_latest_wins",
						listId: "lst_tie",
						name: "Latest Wins",
						position: 2,
						createdAt: 100,
						updatedAt: 100,
					}),
				]);
				await household.db.insert(itemChecks).values([
					// updated_at tie: usr_zzz wins by user_id DESC with an unchecked row.
					itemCheckFixture({
						itemId: "itm_tie_unchecked",
						userId: "usr_aaa",
						checkedAt: 500,
						updatedAt: 900,
					}),
					itemCheckFixture({
						itemId: "itm_tie_unchecked",
						userId: "usr_zzz",
						checkedAt: null,
						updatedAt: 900,
					}),
					// updated_at tie: usr_zzz wins by user_id DESC with a checked row.
					itemCheckFixture({
						itemId: "itm_tie_checked",
						userId: "usr_aaa",
						checkedAt: null,
						updatedAt: 900,
					}),
					itemCheckFixture({
						itemId: "itm_tie_checked",
						userId: "usr_zzz",
						checkedAt: 600,
						updatedAt: 900,
					}),
					// No tie: usr_aaa wins by updated_at DESC despite the lower user_id.
					itemCheckFixture({
						itemId: "itm_latest_wins",
						userId: "usr_aaa",
						checkedAt: 800,
						updatedAt: 1000,
					}),
					itemCheckFixture({
						itemId: "itm_latest_wins",
						userId: "usr_zzz",
						checkedAt: null,
						updatedAt: 900,
					}),
				]);
				const service = serviceFor(household);

				await expect(service.listLists()).resolves.toEqual([
					expect.objectContaining({
						id: "lst_tie",
						uncheckedItemCount: 1,
						checkedItemCount: 2,
						lastActivityAt: 1000,
					}),
				]);
			} finally {
				await household.close();
			}
		});

		it("excludes tombstoned Items and their check rows from counts and activity", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values(
					listFixture({
						id: "lst_tomb",
						name: "Tombstones",
						createdAt: 100,
						updatedAt: 150,
					}),
				);
				await household.db.insert(items).values([
					itemFixture({
						id: "itm_active",
						listId: "lst_tomb",
						name: "Active",
						position: 0,
						createdAt: 100,
						updatedAt: 200,
					}),
					itemFixture({
						id: "itm_dead",
						listId: "lst_tomb",
						name: "Dead",
						position: 1,
						createdAt: 100,
						updatedAt: 5000,
						deletedAt: 5000,
					}),
				]);
				await household.db.insert(itemChecks).values(
					itemCheckFixture({
						itemId: "itm_dead",
						userId: "usr_avery",
						checkedAt: 9000,
						updatedAt: 9000,
					}),
				);
				const service = serviceFor(household);

				await expect(service.listLists()).resolves.toEqual([
					expect.objectContaining({
						id: "lst_tomb",
						uncheckedItemCount: 1,
						checkedItemCount: 0,
						lastActivityAt: 200,
					}),
				]);
			} finally {
				await household.close();
			}
		});

		it("sorts recentActivity by lastActivityAt DESC with createdAt ASC and id ASC tie-breakers", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values([
					listFixture({
						id: "lst_list_driven",
						name: "List Driven",
						createdAt: 10,
						updatedAt: 3000,
					}),
					listFixture({
						id: "lst_item_driven",
						name: "Item Driven",
						createdAt: 20,
						updatedAt: 100,
					}),
					listFixture({
						id: "lst_check_driven",
						name: "Check Driven",
						createdAt: 30,
						updatedAt: 100,
					}),
					listFixture({
						id: "lst_tie_older",
						name: "Tie Older",
						createdAt: 40,
						updatedAt: 2000,
					}),
					listFixture({
						id: "lst_tie_newer",
						name: "Tie Newer",
						createdAt: 50,
						updatedAt: 2000,
					}),
					listFixture({
						id: "lst_x1",
						name: "X One",
						createdAt: 60,
						updatedAt: 1000,
					}),
					listFixture({
						id: "lst_x2",
						name: "X Two",
						createdAt: 60,
						updatedAt: 1000,
					}),
				]);
				await household.db.insert(items).values([
					itemFixture({
						id: "itm_drives_list",
						listId: "lst_item_driven",
						name: "Drives Activity",
						position: 0,
						createdAt: 100,
						updatedAt: 4000,
					}),
					itemFixture({
						id: "itm_checked_late",
						listId: "lst_check_driven",
						name: "Checked Late",
						position: 0,
						createdAt: 100,
						updatedAt: 200,
					}),
				]);
				await household.db.insert(itemChecks).values(
					itemCheckFixture({
						itemId: "itm_checked_late",
						userId: "usr_avery",
						checkedAt: 5000,
						updatedAt: 5000,
					}),
				);
				const service = serviceFor(household);

				const summaries = await service.listLists({ sort: "recentActivity" });

				expect(summaries.map((summary) => summary.id)).toEqual([
					"lst_check_driven",
					"lst_item_driven",
					"lst_list_driven",
					"lst_tie_older",
					"lst_tie_newer",
					"lst_x1",
					"lst_x2",
				]);
			} finally {
				await household.close();
			}
		});

		it("sorts name case-insensitively with createdAt ASC and id ASC tie-breakers", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values([
					listFixture({
						id: "lst_b",
						name: "banana",
						createdAt: 10,
						updatedAt: 10,
					}),
					listFixture({
						id: "lst_a2",
						name: "Apple",
						createdAt: 20,
						updatedAt: 20,
					}),
					listFixture({
						id: "lst_a1",
						name: "apple",
						createdAt: 10,
						updatedAt: 10,
					}),
					listFixture({
						id: "lst_c2",
						name: "Cherry",
						createdAt: 30,
						updatedAt: 30,
					}),
					listFixture({
						id: "lst_c1",
						name: "Cherry",
						createdAt: 30,
						updatedAt: 30,
					}),
				]);
				const service = serviceFor(household);

				const summaries = await service.listLists({ sort: "name" });

				expect(summaries.map((summary) => summary.id)).toEqual([
					"lst_a1",
					"lst_a2",
					"lst_b",
					"lst_c1",
					"lst_c2",
				]);
			} finally {
				await household.close();
			}
		});

		it("sorts createdAt by createdAt DESC with id ASC tie-breaker", async () => {
			const household = await createTestHouseholdDb();

			try {
				await household.db.insert(lists).values([
					listFixture({
						id: "lst_d2",
						name: "Oldest",
						createdAt: 100,
						updatedAt: 100,
					}),
					listFixture({
						id: "lst_d3",
						name: "Newer B",
						createdAt: 300,
						updatedAt: 300,
					}),
					listFixture({
						id: "lst_d1",
						name: "Newer A",
						createdAt: 300,
						updatedAt: 300,
					}),
				]);
				const service = serviceFor(household);

				const summaries = await service.listLists({ sort: "createdAt" });

				expect(summaries.map((summary) => summary.id)).toEqual([
					"lst_d1",
					"lst_d3",
					"lst_d2",
				]);
			} finally {
				await household.close();
			}
		});
	});
});

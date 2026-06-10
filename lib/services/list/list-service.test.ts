import { eq } from "drizzle-orm";

import {
	itemFixture,
	listFixture,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { items, lists } from "@/db/schema/household";
import {
	createTestDirectoryDb,
	createTestHouseholdDb,
	type TestHouseholdDb,
} from "@/db/test";
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
	options: { analytics?: MockAnalytics } = {},
) {
	return createListService({
		householdId: "hh_avery",
		userId: "usr_avery",
		store: { execute: household.client.execute.bind(household.client) },
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
	});
});

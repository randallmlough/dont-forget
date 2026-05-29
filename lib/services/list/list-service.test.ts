import { listFixture, seedPrimaryHouseholdScenario } from "@/db/fixtures";
import { lists } from "@/db/schema/household";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import { createMockLogger } from "@/lib/test/mocks/logger";

import { createListService, ListNotFoundError } from "./list-service";

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

describe("createListService", () => {
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
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(
				service.getList({ listId: scenario.lists.groceries.id }),
			).resolves.toEqual({
				id: scenario.lists.groceries.id,
				householdId: scenario.household.id,
				name: scenario.lists.groceries.name,
				createdByUserId: scenario.users.avery.id,
				createdAt: scenario.lists.groceries.createdAt,
				updatedAt: scenario.lists.groceries.updatedAt,
			});
		} finally {
			await directory.close();
			await household.close();
		}
	});

	it("coerces string SQL timestamp columns when loading List metadata", async () => {
		const service = createListService({
			householdId: "hh_avery",
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
							},
						],
					};
				},
			},
			logger: testLogger,
		});

		await expect(service.getList({ listId: "lst_weekend" })).resolves.toEqual(
			expect.objectContaining({
				createdAt: 1_700_000_000_000,
				updatedAt: 1_700_000_000_100,
			}),
		);
	});

	it("rejects when the List is missing", async () => {
		const household = await createTestHouseholdDb();

		try {
			const service = createListService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.getList({ listId: "lst_missing" })).rejects.toThrow(
				ListNotFoundError,
			);
		} finally {
			await household.close();
		}
	});

	it("rejects when the List is tombstoned", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values(
				listFixture({
					id: "lst_archived",
					name: "Archived Groceries",
					createdByUserId: "usr_avery",
					deletedAt: 1_700_000_000_200,
				}),
			);
			const service = createListService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.getList({ listId: "lst_archived" })).rejects.toThrow(
				ListNotFoundError,
			);
		} finally {
			await household.close();
		}
	});
});

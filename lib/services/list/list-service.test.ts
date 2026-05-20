import { lists } from "@/db/schema/household";
import { createTestHouseholdDb } from "@/db/test";
import type { Logger } from "@/lib/logger";

import { createListService, ListNotFoundError } from "./list-service";

const testLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
} satisfies jest.Mocked<Logger>;
testLogger.with.mockImplementation(() => testLogger);

beforeEach(() => {
	testLogger.debug.mockReset();
	testLogger.info.mockReset();
	testLogger.warn.mockReset();
	testLogger.error.mockReset();
	testLogger.with.mockClear();
});

describe("createListService", () => {
	it("loads List metadata by List ID", async () => {
		const household = await createTestHouseholdDb();

		try {
			await household.db.insert(lists).values({
				id: "lst_weekend",
				name: "Weekend Groceries",
				createdByUserId: "usr_avery",
				createdAt: 1_700_000_000_000,
				updatedAt: 1_700_000_000_100,
			});
			const service = createListService({
				householdId: "hh_avery",
				store: { execute: household.client.execute.bind(household.client) },
				logger: testLogger,
			});

			await expect(service.getList({ listId: "lst_weekend" })).resolves.toEqual(
				{
					id: "lst_weekend",
					householdId: "hh_avery",
					name: "Weekend Groceries",
					createdByUserId: "usr_avery",
					createdAt: 1_700_000_000_000,
					updatedAt: 1_700_000_000_100,
				},
			);
		} finally {
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
			await household.db.insert(lists).values({
				id: "lst_archived",
				name: "Archived Groceries",
				createdByUserId: "usr_avery",
				deletedAt: 1_700_000_000_200,
			});
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

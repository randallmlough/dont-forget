import { eq } from "drizzle-orm";
import { seedPrimaryHouseholdScenario } from "@/db/fixtures";
import { itemChecks, items, lists } from "@/db/schema/household";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import type {
	HouseholdSqlResult,
	HouseholdSqlStatement,
} from "@/lib/services/household/household-store";
import { deferred } from "@/lib/test/async";
import { createMockLogger } from "@/lib/test/mocks/logger";
import { createSessionDataServices } from "./services";

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

const logger = createMockLogger();

describe("createSessionDataServices", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		logger.with.mockReturnValue(logger);
	});

	it("loads List and Item data through explicit listId service calls", async () => {
		const harness = await createSeededServicesHarness();

		try {
			await expect(
				harness.services.lists.getList({
					listId: harness.scenario.ids.groceriesListId,
				}),
			).resolves.toMatchObject({
				id: harness.scenario.ids.groceriesListId,
				name: "Groceries",
			});
			await expect(
				harness.services.items.listItems({
					listId: harness.scenario.ids.groceriesListId,
				}),
			).resolves.toEqual([
				expect.objectContaining({
					id: harness.scenario.items.unchecked.id,
					listId: harness.scenario.ids.groceriesListId,
					name: "Milk",
					checked: false,
				}),
				expect.objectContaining({
					id: harness.scenario.items.checkedByAvery.id,
					name: "Eggs",
					checked: true,
					checkedByUserId: harness.scenario.users.avery.id,
				}),
				expect.objectContaining({
					id: harness.scenario.items.checkedByBlake.id,
					name: "Bread",
					checked: true,
					checkedByUserId: harness.scenario.users.blake.id,
				}),
			]);
		} finally {
			await harness.close();
		}
	});

	it("uses explicit listId for Item writes", async () => {
		const harness = await createSeededServicesHarness();

		try {
			const item = await harness.services.items.addItem({
				listId: harness.scenario.ids.groceriesListId,
				userId: harness.scenario.users.avery.id,
				name: "Eggs",
				quantity: null,
				notes: null,
			});
			await harness.services.items.setItemChecked({
				listId: harness.scenario.ids.groceriesListId,
				itemId: item.id,
				userId: harness.scenario.users.avery.id,
				checked: true,
			});

			await expect(
				harness.household.db.query.items.findFirst({
					where: eq(items.id, item.id),
				}),
			).resolves.toMatchObject({
				id: item.id,
				listId: harness.scenario.ids.groceriesListId,
				name: "Eggs",
			});
			await expect(
				harness.household.db.query.itemChecks.findFirst({
					where: eq(itemChecks.itemId, item.id),
				}),
			).resolves.toMatchObject({
				itemId: item.id,
				userId: harness.scenario.users.avery.id,
				checkedAt: expect.any(Number),
			});
		} finally {
			await harness.close();
		}
	});

	it("binds List creation to the authenticated app-owned User ID", async () => {
		const harness = await createSeededServicesHarness();
		const callerInputWithOverride: {
			name: string;
			createdByUserId: string;
		} = {
			name: "Costco",
			createdByUserId: "usr_mallory",
		};

		try {
			const result = await harness.services.lists.createList(
				callerInputWithOverride,
			);

			if (result.status !== "created") {
				throw new Error("Expected List creation to succeed");
			}
			expect(result.list.createdByUserId).toBe(harness.scenario.users.avery.id);
			await expect(
				harness.household.db.query.lists.findFirst({
					where: eq(lists.id, result.list.id),
				}),
			).resolves.toMatchObject({
				createdByUserId: harness.scenario.users.avery.id,
			});
		} finally {
			await harness.close();
		}
	});

	it("creates services only after the HouseholdStore opens", async () => {
		const store = storeFixture();
		const openedStore = deferred<ReturnType<typeof storeFixture>>();
		const openStore = jest.fn(() => openedStore.promise);
		const servicesPromise = createSessionDataServices(
			{
				householdId: "hh_avery",
				userId: "usr_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ openStore },
		);
		let resolved = false;
		void servicesPromise.then(() => {
			resolved = true;
		});
		await Promise.resolve();

		expect(resolved).toBe(false);
		expect(openStore).toHaveBeenCalledWith({
			householdId: "hh_avery",
			database: { url: "libsql://example", authToken: "secret" },
		});

		openedStore.resolve(store);
		await expect(servicesPromise).resolves.toMatchObject({
			syncAuthorized: true,
		});
	});

	it("uses native sync result for full sync", async () => {
		const store = storeFixture();
		store.sync.mockResolvedValueOnce({ changed: true });
		const services = await createSessionDataServices(
			{
				householdId: "hh_avery",
				userId: "usr_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(services.sync()).resolves.toEqual({ changed: true });

		expect(store.sync).toHaveBeenCalledTimes(1);
	});

	it("uses native push only for pushLocalOnly sync when native push succeeds", async () => {
		const store = storeFixture();
		const services = await createSessionDataServices(
			{
				householdId: "hh_avery",
				userId: "usr_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(services.sync({ mode: "pushLocalOnly" })).resolves.toEqual({
			changed: false,
		});

		expect(store.push).toHaveBeenCalledTimes(1);
		expect(store.sync).not.toHaveBeenCalled();
	});

	it("propagates native sync failures", async () => {
		const store = storeFixture();
		const networkError = new TypeError("Network request failed");
		store.sync.mockRejectedValueOnce(networkError);
		const services = await createSessionDataServices(
			{
				householdId: "hh_avery",
				userId: "usr_avery",
				database: { url: "libsql://example", authToken: "secret" },
				logger,
			},
			{ store },
		);

		await expect(services.sync()).rejects.toBe(networkError);
	});

	it("does not run native sync when the session is not authorized for sync", async () => {
		const store = storeFixture({ syncAuthorized: false });
		const services = await createSessionDataServices(
			{
				householdId: "hh_avery",
				userId: "usr_avery",
				database: { url: "libsql://example" },
				logger,
			},
			{ store },
		);

		await expect(services.sync()).resolves.toEqual({ changed: false });
		expect(store.sync).not.toHaveBeenCalled();
		expect(store.push).not.toHaveBeenCalled();
	});
});

async function createSeededServicesHarness() {
	const directory = await createTestDirectoryDb();
	const household = await createTestHouseholdDb();
	const scenario = await seedPrimaryHouseholdScenario({
		directory: directory.db,
		household: household.db,
	});
	const store = storeFixture({
		execute: household.client.execute.bind(household.client),
	});
	const services = await createSessionDataServices(
		{
			householdId: scenario.household.id,
			userId: scenario.users.avery.id,
			database: { url: "libsql://example", authToken: "secret" },
			logger,
		},
		{ store },
	);

	return {
		directory,
		household,
		scenario,
		services,
		async close() {
			await directory.close();
			await household.close();
		},
	};
}

function storeFixture(
	overrides: {
		execute?: (statement: HouseholdSqlStatement) => Promise<HouseholdSqlResult>;
		syncAuthorized?: boolean;
	} = {},
) {
	return {
		syncAuthorized: overrides.syncAuthorized ?? true,
		execute: jest.fn(
			overrides.execute ??
				(async () => ({
					rows: [],
					rowsAffected: 0,
					lastInsertRowId: null,
				})),
		),
		pull: jest.fn(async () => ({ changed: false })),
		push: jest.fn(async () => undefined),
		sync: jest.fn(async () => ({ changed: false })),
		close: jest.fn(async () => undefined),
	};
}

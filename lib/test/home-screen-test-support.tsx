import { fireEvent, render, screen } from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import type { PropsWithChildren, ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthenticatedAppSession } from "@/components/session";
import {
	itemFixture,
	listFixture,
	type PrimaryHouseholdScenario,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { items, lists } from "@/db/schema/household";
import type { TestDirectoryDb, TestHouseholdDb } from "@/db/test";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import type {
	CurrentListSelectionScope,
	CurrentListSelectionWriteOptions,
} from "@/lib/local-storage/current-list-selection";
import type { HouseholdSqlStatement } from "@/lib/services/household/household-store";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { createSessionDataServices } from "@/lib/services/session/services";
import type { SyncStatus } from "@/lib/services/sync";
import { analyticsMocks } from "@/lib/test/mocks/analytics";
import { createMockLogger } from "@/lib/test/mocks/logger";

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

export const mockCurrentListSelectionStore = {
	readSelection: jest.fn(async () => null as string | null),
	writeSelection: jest.fn(async () => undefined),
	clearSelection: jest.fn(
		async (
			_scope: CurrentListSelectionScope,
			_options?: CurrentListSelectionWriteOptions,
		) => undefined,
	),
	clearSelectionsForUser: jest.fn(async () => undefined),
};

jest.mock("@/lib/local-storage/current-list-selection", () => ({
	currentListSelectionStore: mockCurrentListSelectionStore,
}));

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

export const testLogger = createMockLogger();
testLogger.with.mockReturnValue(testLogger);

export const noopProviderActions = {
	retry() {},
	reloadSession() {},
	async signOut() {},
};

const homeScreenModule = jest.requireActual<
	typeof import("@/screens/home/home-screen")
>("@/screens/home/home-screen");

export const HomeScreen = homeScreenModule.default;
export const HomeScreenView = homeScreenModule.HomeScreenView;
export const mockUseAuthenticatedAppSession = jest.mocked(
	useAuthenticatedAppSession,
);

export function resetHomeTestMocks() {
	testLogger.debug.mockReset();
	testLogger.info.mockReset();
	testLogger.warn.mockReset();
	testLogger.error.mockReset();
	testLogger.with.mockClear();
	testLogger.with.mockImplementation(() => testLogger);
	analyticsMocks.track.mockReset();
	mockCurrentListSelectionStore.readSelection.mockReset();
	mockCurrentListSelectionStore.readSelection.mockResolvedValue(null);
	mockCurrentListSelectionStore.writeSelection.mockReset();
	mockCurrentListSelectionStore.writeSelection.mockResolvedValue(undefined);
	mockCurrentListSelectionStore.clearSelection.mockReset();
	mockCurrentListSelectionStore.clearSelection.mockResolvedValue(undefined);
	mockCurrentListSelectionStore.clearSelectionsForUser.mockReset();
	mockCurrentListSelectionStore.clearSelectionsForUser.mockResolvedValue(
		undefined,
	);
	mockUseAuthenticatedAppSession.mockReset();
}

type HomeSessionHarness = {
	directory: TestDirectoryDb;
	household: TestHouseholdDb;
	scenario: PrimaryHouseholdScenario;
	session: AuthenticatedAppSession;
	createListCount: () => number;
	renameListCount: () => number;
	listReadCount: () => number;
	syncRequestSync: jest.Mock;
	close: () => Promise<void>;
};

type HomeSessionHarnessOptions = {
	failNextListRead?: boolean;
	listName?: string;
	listReadGate?: Promise<void>;
	resourceKey?: string;
	uncheckedItemName?: string;
	includeWeekendList?: boolean;
	includeDeletedList?: boolean;
	includeArchivedList?: boolean;
	extraActiveListCount?: number;
	failListReadForListIds?: string[];
	listReadGatesByListId?: Record<string, Promise<void>>;
	createListGate?: Promise<void>;
	failCreateList?: boolean;
	renameListGate?: Promise<void>;
	failRenameList?: boolean;
	failSyncRequest?: boolean;
	syncRequestGate?: Promise<void>;
	syncStatus?: SyncStatus;
};

export async function createHomeSessionHarness(
	options: HomeSessionHarnessOptions = {},
): Promise<HomeSessionHarness> {
	const directory = await createTestDirectoryDb();
	const household = await createTestHouseholdDb();
	const scenario = await seedPrimaryHouseholdScenario({
		directory: directory.db,
		household: household.db,
	});
	await applyHomeScenarioOptions(household, scenario, options);

	let listReadCount = 0;
	let shouldFailNextListRead = options.failNextListRead ?? false;
	const execute = async (statement: HouseholdSqlStatement) => {
		if (isCurrentListRead(statement)) {
			listReadCount += 1;
			const listId = currentListReadListId(statement);
			await (listId ? options.listReadGatesByListId?.[listId] : undefined);
			await options.listReadGate;
			if (shouldFailNextListRead) {
				shouldFailNextListRead = false;
				throw new Error("offline");
			}
			if (listId && options.failListReadForListIds?.includes(listId)) {
				throw new Error("offline");
			}
		}
		return household.client.execute(statement);
	};
	const dataServices = await createSessionDataServices(
		{
			householdId: scenario.household.id,
			userId: scenario.users.avery.id,
			database: { url: "libsql://example", authToken: "secret" },
			logger: testLogger,
		},
		{
			store: {
				syncAuthorized: false,
				execute,
				close() {},
			},
		},
	);
	let createListCount = 0;
	let renameListCount = 0;
	const createList = dataServices.lists.createList.bind(dataServices.lists);
	const renameList = dataServices.lists.renameList.bind(dataServices.lists);
	const syncCoordinator = passiveSyncCoordinator({
		failSyncRequest: options.failSyncRequest,
		requestGate: options.syncRequestGate,
		status: options.syncStatus,
	});
	const session: AuthenticatedAppSession = {
		user: {
			id: scenario.users.avery.id,
			email: scenario.users.avery.email ?? null,
			displayName: scenario.users.avery.displayName ?? null,
		},
		activeHousehold: {
			id: scenario.household.id,
			name: scenario.household.name,
		},
		households: [
			{
				id: scenario.household.id,
				name: scenario.household.name,
				role: scenario.members.avery.role,
				isActive: true,
			},
		],
		activeMember: {
			id: scenario.members.avery.id,
			userId: scenario.users.avery.id,
			role: scenario.members.avery.role,
			displayName: scenario.users.avery.displayName ?? null,
		},
		members: [
			{
				membershipId: scenario.members.avery.id,
				userId: scenario.users.avery.id,
				role: scenario.members.avery.role,
				displayName: scenario.users.avery.displayName ?? null,
			},
			{
				membershipId: scenario.members.blake.id,
				userId: scenario.users.blake.id,
				role: scenario.members.blake.role,
				displayName: scenario.users.blake.displayName ?? null,
			},
		],
		resourceKey: options.resourceKey ?? "authenticated-app-session:seeded",
		services: {
			lists: {
				...dataServices.lists,
				async createList(input) {
					createListCount += 1;
					await options.createListGate;
					if (options.failCreateList) {
						throw new Error("offline");
					}
					return createList(input);
				},
				async renameList(input) {
					renameListCount += 1;
					await options.renameListGate;
					if (options.failRenameList) {
						throw new Error("offline");
					}
					return renameList(input);
				},
			},
			items: dataServices.items,
			sync: syncCoordinator,
		},
	};

	return {
		directory,
		household,
		scenario,
		session,
		createListCount: () => createListCount,
		renameListCount: () => renameListCount,
		listReadCount: () => listReadCount,
		syncRequestSync: syncCoordinator.requestSync,
		async close() {
			await dataServices.close();
			await directory.close();
			await household.close();
		},
	};
}

async function applyHomeScenarioOptions(
	household: TestHouseholdDb,
	scenario: PrimaryHouseholdScenario,
	options: HomeSessionHarnessOptions,
): Promise<void> {
	if (options.listName) {
		await household.db
			.update(lists)
			.set({ name: options.listName })
			.where(eq(lists.id, scenario.ids.groceriesListId));
	}

	if (options.uncheckedItemName) {
		await household.db
			.update(items)
			.set({ name: options.uncheckedItemName })
			.where(eq(items.id, scenario.items.unchecked.id));
	}

	if (options.includeWeekendList) {
		const groceriesCreatedAt = scenario.lists.groceries.createdAt ?? 0;
		const groceriesUpdatedAt = scenario.lists.groceries.updatedAt ?? 0;
		await household.db.insert(lists).values(
			listFixture({
				id: "lst_weekend",
				name: "Weekend",
				createdByUserId: scenario.users.avery.id,
				createdAt: groceriesCreatedAt - 2,
				updatedAt: groceriesUpdatedAt - 2,
			}),
		);
		await household.db.insert(items).values(
			itemFixture({
				id: "itm_weekend_apples",
				listId: "lst_weekend",
				name: "Apples",
				position: 0,
				createdByUserId: scenario.users.avery.id,
				createdAt: groceriesCreatedAt - 1,
				updatedAt: groceriesUpdatedAt - 1,
			}),
		);
	}

	if (options.includeDeletedList) {
		const groceriesUpdatedAt = scenario.lists.groceries.updatedAt ?? 0;
		await household.db.insert(lists).values(
			listFixture({
				id: "lst_deleted",
				name: "Deleted",
				createdByUserId: scenario.users.avery.id,
				createdAt: groceriesUpdatedAt + 10,
				updatedAt: groceriesUpdatedAt + 10,
				deletedAt: groceriesUpdatedAt + 20,
			}),
		);
	}

	if (options.includeArchivedList) {
		const groceriesUpdatedAt = scenario.lists.groceries.updatedAt ?? 0;
		await household.db.insert(lists).values(
			listFixture({
				id: "lst_archived",
				name: "Archived Camping",
				createdByUserId: scenario.users.avery.id,
				createdAt: groceriesUpdatedAt - 30,
				updatedAt: groceriesUpdatedAt - 20,
				archivedAt: groceriesUpdatedAt - 10,
			}),
		);
		await household.db.insert(items).values(
			itemFixture({
				id: "itm_archived_marshmallows",
				listId: "lst_archived",
				name: "Marshmallows",
				position: 0,
				createdByUserId: scenario.users.avery.id,
				createdAt: groceriesUpdatedAt - 15,
				updatedAt: groceriesUpdatedAt - 15,
			}),
		);
	}

	for (let index = 0; index < (options.extraActiveListCount ?? 0); index += 1) {
		const groceriesUpdatedAt = scenario.lists.groceries.updatedAt ?? 0;
		await household.db.insert(lists).values(
			listFixture({
				id: `lst_extra_${index}`,
				name: `Extra List ${index + 1}`,
				createdByUserId: scenario.users.avery.id,
				createdAt: groceriesUpdatedAt - 100 - index,
				updatedAt: groceriesUpdatedAt - 100 - index,
			}),
		);
	}
}

function isCurrentListRead(statement: HouseholdSqlStatement): boolean {
	return (
		statement.kind === "read" &&
		/FROM\s+lists/i.test(statement.sql) &&
		/WHERE\s+id\s*=\s*\?/i.test(statement.sql)
	);
}

function currentListReadListId(
	statement: HouseholdSqlStatement,
): string | null {
	const [listId] = statement.args ?? [];
	return typeof listId === "string" ? listId : null;
}

function passiveSyncCoordinator(options: {
	failSyncRequest?: boolean;
	requestGate?: Promise<void>;
	status?: SyncStatus;
}): AuthenticatedAppSession["services"]["sync"] & { requestSync: jest.Mock } {
	return {
		getStatus: () => options.status ?? "synced",
		subscribe: () => ({ remove() {} }),
		requestSync: jest.fn(async () => {
			await options.requestGate;
			if (options.failSyncRequest) {
				throw new Error("sync failed");
			}
			return null;
		}),
	};
}

export function renderWithSafeArea(ui: ReactElement) {
	return render(ui, { wrapper: TestSafeAreaProvider });
}

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

export function openAddItemComposer() {
	fireEvent.press(screen.getByLabelText("Add Item"));
}

export function openRenameForList(listName: string) {
	fireEvent.press(
		screen.getByRole("button", { name: `List actions for ${listName}` }),
	);
	fireEvent.press(screen.getByRole("button", { name: "Rename" }));
}

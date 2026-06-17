import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import type { PropsWithChildren, ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthenticatedAppSession } from "@/components/session";
import type { HouseholdSqlStatement } from "@/db/household-store";
import { items, lists } from "@/db/schema/household";
import {
	type PrimaryHouseholdScenario,
	seedPrimaryHouseholdScenario,
} from "@/db/server/fixtures";
import type { TestDirectoryDb, TestHouseholdDb } from "@/db/server/test";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/server/test";
import { track } from "@/lib/analytics";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import {
	clearCurrentListSelection,
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
	setCurrentListSelection,
} from "@/lib/local-storage/current-list-selection";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { createSessionResourceLease } from "@/lib/services/session/resource-lease";
import { createSessionDataServices } from "@/lib/services/session/services";
import { deferred } from "@/lib/test/async";
import { createMockLogger } from "@/lib/test/mocks/logger";

const mockRouterPush = jest.fn();

jest.mock("@/components/session", () => ({
	...jest.requireActual<typeof import("@/components/session")>(
		"@/components/session",
	),
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/lib/local-storage/current-list-selection", () => ({
	getCurrentListSelection: jest.fn(),
	setCurrentListSelection: jest.fn(),
	clearCurrentListSelection: jest.fn(),
	clearCurrentListSelectionIfMatches: jest.fn(),
	clearUserCurrentListSelections: jest.fn(),
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockRouterPush }),
}));

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
const noopProviderActions = {
	retry() {},
	reloadSession() {},
	async signOut() {},
};

const { default: HomeScreen, HomeScreenView } = jest.requireActual<
	typeof import("@/screens/home/home-screen")
>("@/screens/home/home-screen");
const { useHomeListSwitcherRows } = jest.requireActual<
	typeof import("@/screens/home/use-home-list-switcher-rows")
>("@/screens/home/use-home-list-switcher-rows");

beforeEach(() => {
	jest.mocked(getCurrentListSelection).mockReset().mockResolvedValue(null);
	jest.mocked(setCurrentListSelection).mockReset().mockResolvedValue(undefined);
	jest
		.mocked(clearCurrentListSelection)
		.mockReset()
		.mockResolvedValue(undefined);
	jest
		.mocked(clearCurrentListSelectionIfMatches)
		.mockReset()
		.mockResolvedValue(false);
	jest.mocked(track).mockClear();
	mockRouterPush.mockReset();
});

function listSwitchedTrackCalls() {
	return jest
		.mocked(track)
		.mock.calls.filter(([event]) => event === "list_switched");
}

describe("HomeScreen", () => {
	beforeEach(() => {
		testLogger.debug.mockReset();
		testLogger.info.mockReset();
		testLogger.warn.mockReset();
		testLogger.error.mockReset();
		testLogger.with.mockClear();
		testLogger.with.mockImplementation(() => testLogger);
	});

	it("renders provider-derived loading state", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			...noopProviderActions,
		});

		await renderWithSafeArea(<HomeScreen />);

		expect(screen.getByText("Preparing your Household")).toBeTruthy();
	});

	it("renders provider-derived ready state", async () => {
		const harness = await createHomeSessionHarness();
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "ready", refreshing: false },
			session: harness.session,
			...noopProviderActions,
		});

		try {
			await renderWithSafeArea(<HomeScreen />);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy(), {
				timeout: 5_000,
			});
			expect(screen.getByText("Milk")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("wires retry and Settings navigation from the provider", async () => {
		const retry = jest.fn();
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: {
				status: "error",
				message: "Unable to prepare your Household. Please try again.",
			},
			session: null,
			retry,
			reloadSession() {},
			async signOut() {},
		});

		await renderWithSafeArea(<HomeScreen />);

		await fireEvent.press(screen.getByText("Try again"));
		await fireEvent.press(screen.getByText("Settings"));
		expect(retry).toHaveBeenCalledTimes(1);
		expect(track).toHaveBeenCalledWith("settings_opened", { source: "home" });
		expect(mockRouterPush).toHaveBeenCalledWith("/settings");
	});
});

it("remounts Active List when the session resource changes", async () => {
	const firstHarness = await createHomeSessionHarness({
		uncheckedItemName: "Cached Milk",
		resourceKey: "authenticated-app-session:1",
	});
	const secondHarness = await createHomeSessionHarness({
		uncheckedItemName: "Fresh Eggs",
		resourceKey: "authenticated-app-session:2",
	});

	try {
		const { rerender } = await renderWithSafeArea(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={firstHarness.session}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		await rerender(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={secondHarness.session}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
		expect(screen.queryByText("Cached Milk")).toBeNull();
	} finally {
		await firstHarness.close();
		await secondHarness.close();
	}
});

describe("HomeScreenView", () => {
	it("shows Authenticated App Session loading and retryable error states", async () => {
		const retry = jest.fn();

		const { rerender } = await renderWithSafeArea(
			<HomeScreenView state={{ status: "loading" }} session={null} />,
		);
		expect(screen.getByText("Preparing your Household")).toBeTruthy();

		await rerender(
			<HomeScreenView
				state={{
					status: "error",
					message: "Unable to prepare your Household. Please try again.",
				}}
				session={null}
				onRetry={retry}
			/>,
		);

		await fireEvent.press(screen.getByText("Try again"));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("renders Active List data from seeded session services", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Avery")).toBeTruthy());
			expect(screen.getByText("Groceries")).toBeTruthy();
			expect(screen.getByText("Milk")).toBeTruthy();
			expect(screen.getByText("Eggs")).toBeTruthy();
			expect(screen.getByText("Bread")).toBeTruthy();
			expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
			expect(screen.getByText("Checked by Blake Rivera")).toBeTruthy();
			expect(screen.queryByText("Coffee")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("uses active Member fallback name for checked Item display", async () => {
		const harness = await createHomeSessionHarness();
		harness.session.activeMember.displayName = null;
		harness.session.members = harness.session.members.map((member) =>
			member.userId === harness.session.activeMember.userId
				? { ...member, displayName: null }
				: member,
		);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("Checked by Avery Chen")).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});

	it("shows a retryable List error when list loading fails", async () => {
		const harness = await createHomeSessionHarness({ failNextListRead: true });

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("List unavailable")).toBeTruthy(),
			);
			await fireEvent.press(screen.getByText("Try again"));

			await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
			expect(harness.listReadCount()).toBeGreaterThanOrEqual(2);
		} finally {
			await harness.close();
		}
	});

	it("re-queries a failed List when the change signal fires", async () => {
		const harness = await createHomeSessionHarness({ failNextListRead: true });

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("List unavailable")).toBeTruthy(),
			);

			await act(() => {
				harness.fireChange();
			});

			await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
			expect(harness.listReadCount()).toBeGreaterThanOrEqual(2);
		} finally {
			await harness.close();
		}
	});

	it("renders the stored active Current List selection after resolution", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.pharmacy.id);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(getCurrentListSelection).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
			);
			expect(clearCurrentListSelection).not.toHaveBeenCalled();
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("falls back in memory to the most recently active List when no selection is stored", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			// Groceries has the most recent activity in the seeded scenario.
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(setCurrentListSelection).not.toHaveBeenCalled();
			expect(clearCurrentListSelection).not.toHaveBeenCalled();
			// Fallback resolution is not an explicit switch: no analytics.
			expect(listSwitchedTrackCalls()).toHaveLength(0);
		} finally {
			await harness.close();
		}
	});

	it("clears an invalid stored selection and falls back without persisting the fallback", async () => {
		const harness = await createHomeSessionHarness();
		jest.mocked(getCurrentListSelection).mockResolvedValue("lst_ghost");

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledTimes(1);
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
				"lst_ghost",
			);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("clears an archived stored selection and falls back to an active List", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.archived.id);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("Holiday Dinner")).toBeNull();
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledTimes(1);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("clears a deleted stored selection and falls back to an active List", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.deleted.id);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("Camping Trip")).toBeNull();
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledTimes(1);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("excludes a candidate with a typed missing getList() result and renders the next active List", async () => {
		const harness = await createHomeSessionHarness();
		// listLists() still reports Groceries (top candidate), but getList()
		// returns the typed `missing` lifecycle result for it.
		harness.setStaleMissingListIds([harness.scenario.lists.groceries.id]);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Try again")).toBeNull();
			// The stale candidate was not the stored selection, so nothing clears.
			expect(clearCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("excludes a candidate archived between listLists() and getList() and renders the next active List", async () => {
		const harness = await createHomeSessionHarness();
		// listLists() still reports Groceries as active, but getList() sees it
		// archived in the meantime (getList reports archived Lists as available,
		// so the resolver's defensive archived check must exclude it).
		harness.setStaleArchivedListIds([harness.scenario.lists.groceries.id]);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Try again")).toBeNull();
			// The stale candidate was not the stored selection, so nothing clears.
			expect(clearCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("shows a retryable List error when clearing an invalid stored selection fails", async () => {
		const harness = await createHomeSessionHarness();
		jest.mocked(getCurrentListSelection).mockResolvedValue("lst_ghost");
		jest
			.mocked(clearCurrentListSelectionIfMatches)
			.mockRejectedValueOnce(new Error("storage offline"));

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("List unavailable")).toBeTruthy(),
			);
			await fireEvent.press(screen.getByText("Try again"));

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledTimes(2);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("clears the stored selection and re-resolves when getList() returns a typed deleted result", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.pharmacy.id);
		// listLists() still reports Pharmacy as active, but getList() returns the
		// typed `deleted` lifecycle result for it.
		harness.setStaleDeletedListIds([harness.scenario.lists.pharmacy.id]);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Try again")).toBeNull();
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledTimes(1);
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
				harness.scenario.lists.pharmacy.id,
			);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("renders zero-active after a bounded pass when every candidate is stale", async () => {
		const harness = await createHomeSessionHarness();
		harness.setStaleMissingListIds([
			harness.scenario.lists.groceries.id,
			harness.scenario.lists.hardware.id,
			harness.scenario.lists.pharmacy.id,
		]);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			// Bounded: a single listLists() snapshot and one getList() attempt per
			// candidate — a fully stale set cannot loop forever.
			expect(harness.listListsReadCount()).toBe(1);
			expect(harness.getListReadCount()).toBe(3);
			expect(screen.queryByText("Try again")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("renders zero-active with a Create List entry when no active Lists exist", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db.update(lists).set({ deletedAt: 1 });

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
					onOpenSettings={() => {}}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(
				screen.getByText("Create a List to start adding Items."),
			).toBeTruthy();
			expect(screen.getByRole("button", { name: "Create List" })).toBeTruthy();
			// Signed-in Member bar stays visible.
			expect(screen.getByText("Signed in")).toBeTruthy();
			expect(screen.getByText("Avery Chen")).toBeTruthy();
			// No Active List UI: items, add-Item form, refresh, sync status,
			// or retry.
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
			expect(screen.queryByText("Refresh")).toBeNull();
			expect(screen.queryByText("Synced")).toBeNull();
			expect(screen.queryByText("Try again")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("remounts the Active List boundary when the resolved List changes within a session resource", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.pharmacy.id);

		try {
			const { rerender } = await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			await openAddItemComposer();
			await fireEvent.changeText(screen.getByLabelText("Item name"), "Snacks");
			await act(async () => {
				await fireEvent.press(screen.getByLabelText("Submit Item"));
			});
			await act(() => {
				harness.fireChange();
			});
			await waitFor(() => expect(screen.getByText("Snacks")).toBeTruthy());

			jest
				.mocked(getCurrentListSelection)
				.mockResolvedValue(harness.scenario.lists.groceries.id);
			// Same resourceKey, new session identity: re-resolution changes only
			// the resolved List ID, which must remount the Active List boundary.
			await rerender(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={{ ...harness.session }}
				/>,
			);
			await act(() => {
				harness.fireChange();
			});

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
			expect(screen.queryByText("Snacks")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("persists Item add and checked state against the resolved List ID", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.pharmacy.id);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			await openAddItemComposer();
			await fireEvent.changeText(screen.getByLabelText("Item name"), "Yogurt");
			await fireEvent.changeText(
				screen.getByLabelText("Quantity"),
				"half carton",
			);
			await fireEvent.press(screen.getByLabelText("Add note"));
			await fireEvent.changeText(
				screen.getByLabelText("Item note"),
				"Plain Greek",
			);
			await act(async () => {
				await fireEvent.press(screen.getByLabelText("Submit Item"));
			});
			await act(() => {
				harness.fireChange();
			});
			await waitFor(() => expect(screen.getByText("Yogurt")).toBeTruthy());
			expect(screen.getByText("half carton - Plain Greek")).toBeTruthy();
			await act(async () => {
				await fireEvent.press(
					screen.getByRole("checkbox", { name: /^Yogurt\b/ }),
				);
			});
			await act(() => {
				harness.fireChange();
			});

			const persistedItem = await harness.household.db.query.items.findFirst({
				where: (table, { eq }) => eq(table.name, "Yogurt"),
			});
			expect(persistedItem).toBeDefined();
			if (!persistedItem) throw new Error("Expected persisted Item");
			expect(persistedItem).toMatchObject({
				listId: harness.scenario.lists.pharmacy.id,
				name: "Yogurt",
				quantity: "half carton",
				notes: "Plain Greek",
				createdByUserId: harness.scenario.users.avery.id,
			});
			await expect(
				harness.household.db.query.itemChecks.findFirst({
					where: (table, { eq }) => eq(table.itemId, persistedItem.id),
				}),
			).resolves.toMatchObject({
				itemId: persistedItem.id,
				userId: harness.scenario.users.avery.id,
				checkedAt: expect.any(Number),
			});
		} finally {
			await harness.close();
		}
	});

	it("ignores stale List loads after the session resource changes", async () => {
		const staleListRead = deferred<void>();
		const freshListRead = deferred<void>();
		const staleHarness = await createHomeSessionHarness({
			listName: "Stale",
			resourceKey: "authenticated-app-session:1",
			listReadGate: staleListRead.promise,
		});
		const freshHarness = await createHomeSessionHarness({
			uncheckedItemName: "Fresh Eggs",
			resourceKey: "authenticated-app-session:2",
			listReadGate: freshListRead.promise,
		});

		try {
			const { rerender } = await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={staleHarness.session}
				/>,
			);

			await rerender(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={freshHarness.session}
				/>,
			);

			await act(async () => {
				freshListRead.resolve();
				await freshListRead.promise;
			});
			await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());

			await act(async () => {
				staleListRead.resolve();
				await staleListRead.promise;
			});
			expect(screen.queryByText("Stale")).toBeNull();
			expect(screen.getByText("Fresh Eggs")).toBeTruthy();
		} finally {
			await staleHarness.close();
			await freshHarness.close();
		}
	});

	it("clears a stored selection that survives to the post-loop clear when every candidate is stale", async () => {
		const harness = await createHomeSessionHarness();
		// Pharmacy is stored and present in the listLists() snapshot, but every
		// candidate (including it) is stale at getList() time, so the resolver
		// exits the loop with zeroActive and must clear via the post-loop branch.
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.pharmacy.id);
		harness.setStaleMissingListIds([
			harness.scenario.lists.groceries.id,
			harness.scenario.lists.hardware.id,
			harness.scenario.lists.pharmacy.id,
		]);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledTimes(1);
			expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
				harness.scenario.lists.pharmacy.id,
			);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
			expect(listSwitchedTrackCalls()).toHaveLength(0);
		} finally {
			await harness.close();
		}
	});

	it("targets Item writes at the resolved List, not a stale stored selection", async () => {
		const harness = await createHomeSessionHarness();
		// Stored selection (archived Holiday Dinner) differs from the resolved
		// fallback (Groceries); Item writes must follow the RESOLVED List.
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.archived.id);

		try {
			await renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

			await openAddItemComposer();
			await fireEvent.changeText(screen.getByLabelText("Item name"), "Lantern");
			await act(async () => {
				await fireEvent.press(screen.getByLabelText("Submit Item"));
			});
			await act(() => {
				harness.fireChange();
			});
			await waitFor(() => expect(screen.getByText("Lantern")).toBeTruthy());

			const persistedItem = await harness.household.db.query.items.findFirst({
				where: (table, { eq }) => eq(table.name, "Lantern"),
			});
			expect(persistedItem?.listId).toBe(harness.scenario.lists.groceries.id);
			expect(persistedItem?.listId).not.toBe(
				harness.scenario.lists.archived.id,
			);
		} finally {
			await harness.close();
		}
	});
});

describe("List switcher", () => {
	it("removes the switcher change subscription after unmount", async () => {
		const changeListeners = new Set<() => void>();
		const listLists = jest.fn(async () => []);
		const session = homeListSwitcherSession({
			listLists,
			changes: {
				subscribe(listener) {
					changeListeners.add(listener);
					return {
						remove() {
							changeListeners.delete(listener);
						},
					};
				},
			},
		});

		function Harness() {
			useHomeListSwitcherRows(session);
			return null;
		}

		const rendered = await render(<Harness />);
		await waitFor(() => expect(listLists).toHaveBeenCalledTimes(1));
		expect(changeListeners.size).toBe(1);

		await rendered.unmount();
		expect(changeListeners.size).toBe(0);

		await act(() => {
			for (const listener of changeListeners) listener();
		});
		expect(listLists).toHaveBeenCalledTimes(1);
	});

	async function renderHomeReady(harness: HomeSessionHarness) {
		const rendered = await renderWithSafeArea(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={harness.session}
			/>,
		);
		await waitFor(() =>
			expect(screen.getByLabelText("Switch List")).toBeTruthy(),
		);
		return rendered;
	}

	async function openSwitcher() {
		await fireEvent.press(screen.getByLabelText("Switch List"));
	}

	it("opens from the Current List header and lists only active List summaries", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderHomeReady(harness);
			await openSwitcher();

			await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
			expect(screen.getByText("Pharmacy")).toBeTruthy();
			// Groceries appears in the Active List header and as a switcher row.
			expect(screen.getAllByText("Groceries")).toHaveLength(2);
			expect(screen.getByText("1 unchecked · 2 checked")).toBeTruthy();
			expect(screen.getAllByText("0 unchecked · 0 checked")).toHaveLength(2);
			// Active-only rows: archived and deleted Lists never appear.
			expect(screen.queryByText("Holiday Dinner")).toBeNull();
			expect(screen.queryByText("Camping Trip")).toBeNull();
			// No search affordance in the MVP switcher.
			expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
			// Opening the sheet emits no analytics.
			expect(listSwitchedTrackCalls()).toHaveLength(0);
		} finally {
			await harness.close();
		}
	});

	it("indicates the current row visually and accessibly", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderHomeReady(harness);
			await openSwitcher();

			await waitFor(() => expect(screen.getByText("Current")).toBeTruthy());
			expect(
				screen.getByRole("button", { name: "Groceries", selected: true }),
			).toBeTruthy();
			expect(
				screen.getByRole("button", { name: "Pharmacy", selected: false }),
			).toBeTruthy();
			expect(
				screen.getByRole("button", { name: "Hardware", selected: false }),
			).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("treats a current row tap as a no-op", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderHomeReady(harness);
			await openSwitcher();
			await waitFor(() => expect(screen.getByText("Current")).toBeTruthy());

			await act(async () => {
				await fireEvent.press(
					screen.getByRole("button", { name: "Groceries", selected: true }),
				);
			});

			expect(setCurrentListSelection).not.toHaveBeenCalled();
			expect(listSwitchedTrackCalls()).toHaveLength(0);
			expect(harness.requestSync).not.toHaveBeenCalled();
			// The sheet stays open with its rows intact.
			expect(screen.getByText("Pharmacy")).toBeTruthy();
			expect(screen.getByText("Current")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("switches to another active List: persists before analytics, closes the sheet, and renders it", async () => {
		const harness = await createHomeSessionHarness();
		// Simulate real storage: once persisted, re-resolution reads the new
		// stored selection.
		jest
			.mocked(setCurrentListSelection)
			.mockImplementation(async (_userId, _householdId, listId) => {
				jest.mocked(getCurrentListSelection).mockResolvedValue(listId);
			});

		try {
			await renderHomeReady(harness);
			await openSwitcher();
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			await act(async () => {
				await fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
			});

			expect(setCurrentListSelection).toHaveBeenCalledTimes(1);
			expect(setCurrentListSelection).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
				harness.scenario.lists.pharmacy.id,
			);
			const switchedCalls = listSwitchedTrackCalls();
			expect(switchedCalls).toHaveLength(1);
			// Typed event shape: identifiers only — no List name, no counts.
			expect(switchedCalls[0]?.[1]).toEqual({
				household_id: harness.scenario.household.id,
				list_id: harness.scenario.lists.pharmacy.id,
				user_id: harness.scenario.users.avery.id,
			});
			// Persistence strictly precedes the analytics emission.
			const persistOrder = jest.mocked(setCurrentListSelection).mock
				.invocationCallOrder[0];
			const trackMock = jest.mocked(track);
			const switchedIndex = trackMock.mock.calls.findIndex(
				([event]) => event === "list_switched",
			);
			const emitOrder = trackMock.mock.invocationCallOrder[switchedIndex];
			expect(persistOrder).toBeLessThan(emitOrder ?? 0);

			// The selected List renders through the resolver/remount path.
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("Milk")).toBeNull();
			// The sheet is closed: switcher rows are gone.
			expect(screen.queryByText("Hardware")).toBeNull();
			expect(screen.queryByText("Current")).toBeNull();
			// Switching never requests sync.
			expect(harness.requestSync).not.toHaveBeenCalled();
			// No DEFAULT_LIST_ID regression: the explicitly selected List is not
			// the default Groceries List, and writes follow it.
			expect(harness.scenario.lists.pharmacy.id).not.toBe(DEFAULT_LIST_ID);

			await openAddItemComposer();
			await fireEvent.changeText(
				screen.getByLabelText("Item name"),
				"Bandages",
			);
			await act(async () => {
				await fireEvent.press(screen.getByLabelText("Submit Item"));
			});
			await act(() => {
				harness.fireChange();
			});
			await waitFor(() => expect(screen.getByText("Bandages")).toBeTruthy());
			const persistedItem = await harness.household.db.query.items.findFirst({
				where: (table, { eq }) => eq(table.name, "Bandages"),
			});
			expect(persistedItem?.listId).toBe(harness.scenario.lists.pharmacy.id);
		} finally {
			await harness.close();
		}
	});

	it("shows a retryable List error when explicit switch re-resolution fails", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(setCurrentListSelection)
			.mockImplementation(async (_userId, _householdId, listId) => {
				jest.mocked(getCurrentListSelection).mockResolvedValue(listId);
			});

		try {
			await renderHomeReady(harness);
			await openSwitcher();
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			harness.failNextListRead();

			await act(async () => {
				await fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
			});

			await waitFor(() =>
				expect(screen.getByText("List unavailable")).toBeTruthy(),
			);
			expect(
				screen.getByText("Unable to load this List. Please try again."),
			).toBeTruthy();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByText("Current")).toBeNull();
			expect(setCurrentListSelection).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
				harness.scenario.lists.pharmacy.id,
			);
			expect(listSwitchedTrackCalls()).toHaveLength(1);
		} finally {
			await harness.close();
		}
	});

	it("does not emit list_switched when selection persistence fails", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(setCurrentListSelection)
			.mockRejectedValueOnce(new Error("storage offline"));

		try {
			await renderHomeReady(harness);
			await openSwitcher();
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			await act(async () => {
				await fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
			});

			expect(setCurrentListSelection).toHaveBeenCalledTimes(1);
			expect(listSwitchedTrackCalls()).toHaveLength(0);
			// The sheet stays open and the current List is unchanged.
			expect(screen.getByText("Pharmacy")).toBeTruthy();
			expect(screen.getByText("Current")).toBeTruthy();

			// The User can retap after the failure (in-flight guard released).
			jest
				.mocked(setCurrentListSelection)
				.mockImplementation(async (_userId, _householdId, listId) => {
					jest.mocked(getCurrentListSelection).mockResolvedValue(listId);
				});
			await act(async () => {
				await fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
			});
			expect(listSwitchedTrackCalls()).toHaveLength(1);
		} finally {
			await harness.close();
		}
	});

	it("dismisses natively and reopens from the header without persistence or analytics", async () => {
		const harness = await createHomeSessionHarness();

		try {
			const rendered = await renderHomeReady(harness);
			await openSwitcher();
			await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());

			// Native swipe-down dismissal fires the sheet Modal's onRequestClose.
			await act(() => {
				rendered.root
					?.queryAll((instance) => instance.type === "Modal")[0]
					?.props.onRequestClose();
			});

			expect(screen.queryByText("Hardware")).toBeNull();
			expect(setCurrentListSelection).not.toHaveBeenCalled();
			expect(listSwitchedTrackCalls()).toHaveLength(0);
			expect(harness.requestSync).not.toHaveBeenCalled();

			// The header opens the switcher again after dismissal.
			await openSwitcher();
			await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
		} finally {
			await harness.close();
		}
	});

	it("retries a failed switcher load without emitting analytics", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderHomeReady(harness);
			harness.failNextListListsRead();
			await openSwitcher();

			await waitFor(() =>
				expect(
					screen.getByText("Unable to load your Lists. Please try again."),
				).toBeTruthy(),
			);
			await fireEvent.press(screen.getByText("Try again"));

			await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
			expect(listSwitchedTrackCalls()).toHaveLength(0);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	describe("lifecycle actions", () => {
		function trackCallsFor(event: string) {
			return jest.mocked(track).mock.calls.filter(([name]) => name === event);
		}

		// Simulate real storage: once persisted, re-resolution reads the new
		// stored selection. The initial stored selection is the seeded current
		// List, so rendering the new List proves persistence preceded the
		// Home update (an in-memory fallback could not explain it).
		function mockSelectionStoragePropagation(initialListId: string) {
			jest.mocked(getCurrentListSelection).mockResolvedValue(initialListId);
			jest
				.mocked(setCurrentListSelection)
				.mockImplementation(async (_userId, _householdId, listId) => {
					jest.mocked(getCurrentListSelection).mockResolvedValue(listId);
				});
		}

		it("creates a List from the switcher: persists selection before Home update, closes the sheet, requests sync, no list_switched", async () => {
			const harness = await createHomeSessionHarness();
			mockSelectionStoragePropagation(harness.scenario.lists.groceries.id);

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());

				await fireEvent.press(
					screen.getByRole("button", { name: "Create List" }),
				);
				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"  Weekend Trip  ",
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Create" }));
				});

				// The List exists locally with the trimmed name and the persisted
				// selection targets it.
				const createdRow = await harness.household.db.query.lists.findFirst({
					where: (table, { eq: equals }) => equals(table.name, "Weekend Trip"),
				});
				expect(createdRow).toBeTruthy();
				expect(setCurrentListSelection).toHaveBeenCalledTimes(1);
				expect(setCurrentListSelection).toHaveBeenCalledWith(
					harness.scenario.users.avery.id,
					harness.scenario.household.id,
					createdRow?.id,
				);

				// Home renders the new empty Current List through re-resolution.
				await waitFor(() =>
					expect(screen.getByText("Weekend Trip")).toBeTruthy(),
				);
				expect(screen.queryByText("Milk")).toBeNull();
				// The sheet is closed.
				expect(screen.queryByText("Hardware")).toBeNull();

				// localWrite sync only after the local write, after persistence.
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				const persistOrder = jest.mocked(setCurrentListSelection).mock
					.invocationCallOrder[0];
				const syncOrder = harness.requestSync.mock.invocationCallOrder[0];
				expect(persistOrder).toBeLessThan(syncOrder ?? 0);

				// Service-owned analytics fire exactly once; create never emits
				// list_switched.
				expect(trackCallsFor("list_created")).toHaveLength(1);
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("creates a List from zero-active Home and renders the new empty Current List", async () => {
			const harness = await createHomeSessionHarness();
			await harness.household.db.update(lists).set({ deletedAt: 1 });
			jest
				.mocked(setCurrentListSelection)
				.mockImplementation(async (_userId, _householdId, listId) => {
					jest.mocked(getCurrentListSelection).mockResolvedValue(listId);
				});

			try {
				await renderWithSafeArea(
					<HomeScreenView
						state={{ status: "ready", refreshing: false }}
						session={harness.session}
					/>,
				);
				await waitFor(() =>
					expect(screen.getByText("No active Lists")).toBeTruthy(),
				);

				await fireEvent.press(
					screen.getByRole("button", { name: "Create List" }),
				);
				await waitFor(() =>
					expect(screen.getByLabelText("List name")).toBeTruthy(),
				);
				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"Camping",
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Create" }));
				});

				// Normal Home restored: the new empty Current List renders.
				await waitFor(() =>
					expect(screen.getByLabelText("Switch List")).toBeTruthy(),
				);
				expect(screen.getByText("Camping")).toBeTruthy();
				expect(screen.queryByText("No active Lists")).toBeNull();
				expect(setCurrentListSelection).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("rejects empty and over-80-character create names with scoped messages and no sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
				await fireEvent.press(
					screen.getByRole("button", { name: "Create List" }),
				);

				await fireEvent.changeText(screen.getByLabelText("List name"), "   ");
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Create" }));
				});
				expect(screen.getByText("List name is required.")).toBeTruthy();

				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"x".repeat(81),
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Create" }));
				});
				expect(
					screen.getByText("List names are 80 characters max."),
				).toBeTruthy();

				// The form stays usable, nothing persisted, no sync, no analytics.
				expect(screen.getByLabelText("List name")).toBeTruthy();
				expect(setCurrentListSelection).not.toHaveBeenCalled();
				expect(harness.requestSync).not.toHaveBeenCalled();
				expect(trackCallsFor("list_created")).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("renames the Current List, updates the Home header, and requests sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Rename Groceries"));
				expect(screen.getByLabelText("List name").props.value).toBe(
					"Groceries",
				);
				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"Food Shop",
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Save" }));
				});

				// The Home header updates through re-resolution; the sheet closes.
				await waitFor(() => expect(screen.getByText("Food Shop")).toBeTruthy());
				expect(screen.queryByText("Groceries")).toBeNull();
				expect(screen.queryByText("Hardware")).toBeNull();
				// Rename never changes the Current List selection.
				expect(setCurrentListSelection).not.toHaveBeenCalled();
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				expect(trackCallsFor("list_renamed")).toHaveLength(1);
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("renames a non-current List, refreshes rows, and keeps the Current List unchanged", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Rename Pharmacy"));
				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"Drugstore",
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Save" }));
				});

				// Back in the switcher with refreshed rows; the sheet stays open.
				await waitFor(() => expect(screen.getByText("Drugstore")).toBeTruthy());
				expect(screen.queryByText("Pharmacy")).toBeNull();
				expect(screen.getByText("Hardware")).toBeTruthy();
				// Current List unchanged: Groceries header + current row.
				expect(screen.getAllByText("Groceries")).toHaveLength(2);
				expect(setCurrentListSelection).not.toHaveBeenCalled();
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("treats an unchanged trimmed rename as a no-op without sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Rename Groceries"));
				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"  Groceries  ",
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Save" }));
				});

				// Returns to the switcher; nothing written, no sync, no analytics.
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
				expect(harness.requestSync).not.toHaveBeenCalled();
				expect(trackCallsFor("list_renamed")).toHaveLength(0);
				expect(screen.getAllByText("Groceries")).toHaveLength(2);
			} finally {
				await harness.close();
			}
		});

		it("rejects invalid rename names with scoped messages and no sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Rename Pharmacy"));
				await fireEvent.changeText(screen.getByLabelText("List name"), "");
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Save" }));
				});
				expect(screen.getByText("List name is required.")).toBeTruthy();

				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"y".repeat(81),
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Save" }));
				});
				expect(
					screen.getByText("List names are 80 characters max."),
				).toBeTruthy();

				expect(harness.requestSync).not.toHaveBeenCalled();
				expect(trackCallsFor("list_renamed")).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("shows a scoped message when renaming a List deleted elsewhere, without sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
				// Deleted between the rows snapshot and the rename: the service
				// pre-read sees the tombstone.
				harness.setStaleDeletedListIds([harness.scenario.lists.pharmacy.id]);

				await fireEvent.press(screen.getByLabelText("Rename Pharmacy"));
				await fireEvent.changeText(
					screen.getByLabelText("List name"),
					"Drugstore",
				);
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Save" }));
				});

				await waitFor(() =>
					expect(
						screen.getByText("This List is no longer available."),
					).toBeTruthy(),
				);
				expect(harness.requestSync).not.toHaveBeenCalled();
				expect(trackCallsFor("list_renamed")).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("deletes a non-current List: keeps the sheet open, refreshes rows, preserves the Current List", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Delete Pharmacy"));
				expect(
					screen.getByText(
						'Delete "Pharmacy"? Its Items will no longer be available.',
					),
				).toBeTruthy();
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
				});

				// Back in the switcher with the deleted row gone; sheet still open.
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
				expect(screen.queryByText("Pharmacy")).toBeNull();
				// Current List unchanged.
				expect(screen.getAllByText("Groceries")).toHaveLength(2);
				expect(setCurrentListSelection).not.toHaveBeenCalled();
				expect(clearCurrentListSelection).not.toHaveBeenCalled();

				const deletedRow = await harness.household.db.query.lists.findFirst({
					where: (table, { eq: equals }) =>
						equals(table.id, harness.scenario.lists.pharmacy.id),
				});
				expect(deletedRow?.deletedAt).not.toBeNull();
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				expect(trackCallsFor("list_deleted")).toHaveLength(1);
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("deletes the Current List and persists the most recently active fallback", async () => {
			const harness = await createHomeSessionHarness();
			mockSelectionStoragePropagation(harness.scenario.lists.groceries.id);

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Delete Groceries"));
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
				});

				// Explicit User repair: pharmacy is the most recently active
				// remaining List (now+2 beats hardware's now+1) and gets persisted.
				expect(setCurrentListSelection).toHaveBeenCalledTimes(1);
				expect(setCurrentListSelection).toHaveBeenCalledWith(
					harness.scenario.users.avery.id,
					harness.scenario.household.id,
					harness.scenario.lists.pharmacy.id,
				);
				expect(clearCurrentListSelection).not.toHaveBeenCalled();

				// Home renders the fallback; the sheet is closed.
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
				expect(screen.queryByText("Groceries")).toBeNull();
				expect(screen.queryByText("Hardware")).toBeNull();
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				expect(trackCallsFor("list_deleted")).toHaveLength(1);
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("does not clear a repaired fallback selection when a stale delete re-resolution finishes later", async () => {
			const harness = await createHomeSessionHarness();
			let storedSelection: string | null = harness.scenario.lists.groceries.id;
			let firedStaleChange = false;
			const staleClearStarted = deferred<void>();
			const allowStaleClear = deferred<void>();

			jest
				.mocked(getCurrentListSelection)
				.mockImplementation(async () => storedSelection);
			jest
				.mocked(setCurrentListSelection)
				.mockImplementation(async (_userId, _householdId, listId) => {
					if (
						!firedStaleChange &&
						listId === harness.scenario.lists.pharmacy.id
					) {
						firedStaleChange = true;
						harness.fireChange();
					}
					storedSelection = listId;
				});
			jest
				.mocked(clearCurrentListSelectionIfMatches)
				.mockImplementation(async (_userId, _householdId, listId) => {
					staleClearStarted.resolve();
					await allowStaleClear.promise;
					if (storedSelection !== listId) return false;
					storedSelection = null;
					return true;
				});

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

				await fireEvent.press(screen.getByLabelText("Delete Groceries"));
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
				});

				await staleClearStarted.promise;
				expect(storedSelection).toBe(harness.scenario.lists.pharmacy.id);

				await act(async () => {
					allowStaleClear.resolve();
					await allowStaleClear.promise;
				});

				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
				expect(storedSelection).toBe(harness.scenario.lists.pharmacy.id);
				expect(clearCurrentListSelectionIfMatches).toHaveBeenCalledWith(
					harness.scenario.users.avery.id,
					harness.scenario.household.id,
					harness.scenario.lists.groceries.id,
				);
			} finally {
				allowStaleClear.resolve();
				await harness.close();
			}
		});

		it("deletes the last active List: clears the selection and renders zero-active with create recovery", async () => {
			const harness = await createHomeSessionHarness();
			await harness.household.db
				.update(lists)
				.set({ deletedAt: 1 })
				.where(eq(lists.id, harness.scenario.lists.pharmacy.id));
			await harness.household.db
				.update(lists)
				.set({ deletedAt: 1 })
				.where(eq(lists.id, harness.scenario.lists.hardware.id));

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() =>
					expect(
						screen.getByRole("button", { name: "Groceries", selected: true }),
					).toBeTruthy(),
				);

				await fireEvent.press(screen.getByLabelText("Delete Groceries"));
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
				});

				expect(clearCurrentListSelection).toHaveBeenCalledWith(
					harness.scenario.users.avery.id,
					harness.scenario.household.id,
				);
				expect(setCurrentListSelection).not.toHaveBeenCalled();

				// Zero-active Home with the create recovery entry; sheet closed.
				await waitFor(() =>
					expect(screen.getByText("No active Lists")).toBeTruthy(),
				);
				expect(
					screen.getByRole("button", { name: "Create List" }),
				).toBeTruthy();
				expect(harness.requestSync).toHaveBeenCalledTimes(1);
				expect(harness.requestSync).toHaveBeenCalledWith({
					reason: "localWrite",
				});
				expect(listSwitchedTrackCalls()).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});

		it("treats deleting an already-deleted List as a no-op without sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
				// The service pre-read sees a tombstone another Member already wrote.
				harness.setStaleDeletedListIds([harness.scenario.lists.pharmacy.id]);

				await fireEvent.press(screen.getByLabelText("Delete Pharmacy"));
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
				});

				// No local write happened: no sync, no analytics; back in the
				// switcher.
				await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
				expect(harness.requestSync).not.toHaveBeenCalled();
				expect(trackCallsFor("list_deleted")).toHaveLength(0);
				expect(setCurrentListSelection).not.toHaveBeenCalled();
				expect(clearCurrentListSelection).not.toHaveBeenCalled();
			} finally {
				await harness.close();
			}
		});

		it("shows a scoped message when deleting a missing List, without sync", async () => {
			const harness = await createHomeSessionHarness();

			try {
				await renderHomeReady(harness);
				await openSwitcher();
				await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
				harness.setStaleMissingListIds([harness.scenario.lists.pharmacy.id]);

				await fireEvent.press(screen.getByLabelText("Delete Pharmacy"));
				await act(async () => {
					await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
				});

				await waitFor(() =>
					expect(
						screen.getByText("This List is no longer available."),
					).toBeTruthy(),
				);
				expect(harness.requestSync).not.toHaveBeenCalled();
				expect(trackCallsFor("list_deleted")).toHaveLength(0);
			} finally {
				await harness.close();
			}
		});
	});
});

type HomeSessionHarness = {
	directory: TestDirectoryDb;
	household: TestHouseholdDb;
	scenario: PrimaryHouseholdScenario;
	session: AuthenticatedAppSession;
	requestSync: jest.MockedFunction<
		AuthenticatedAppSession["services"]["sync"]["requestSync"]
	>;
	listReadCount: () => number;
	listListsReadCount: () => number;
	getListReadCount: () => number;
	fireChange: () => void;
	failNextListRead: () => void;
	failNextListListsRead: () => void;
	setStaleMissingListIds: (listIds: string[]) => void;
	setStaleDeletedListIds: (listIds: string[]) => void;
	setStaleArchivedListIds: (listIds: string[]) => void;
	close: () => Promise<void>;
};

type HomeSessionHarnessOptions = {
	failNextListRead?: boolean;
	listName?: string;
	listReadGate?: Promise<void>;
	resourceKey?: string;
	uncheckedItemName?: string;
};

async function createHomeSessionHarness(
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
	let listListsReadCount = 0;
	let getListReadCount = 0;
	let staleMissingListIds = new Set<string>();
	let staleDeletedListIds = new Set<string>();
	let staleArchivedListIds = new Set<string>();
	let shouldFailNextListRead = options.failNextListRead ?? false;
	let shouldFailNextListListsRead = false;
	const changeListeners = new Set<() => void>();
	const execute = async (statement: HouseholdSqlStatement) => {
		if (isListRead(statement)) {
			listReadCount += 1;
			await options.listReadGate;
			if (shouldFailNextListRead) {
				shouldFailNextListRead = false;
				throw new Error("offline");
			}
		}
		if (isGetListRead(statement)) {
			getListReadCount += 1;
			const listId = String(statement.args?.[0]);
			// Simulate the stale-candidate race: listLists() (same DB) still
			// reports the List, but getList() sees it missing/deleted.
			if (staleMissingListIds.has(listId)) {
				return { rows: [] };
			}
			if (staleDeletedListIds.has(listId)) {
				return { rows: [staleListRow(listId, { deleted_at: 2 })] };
			}
			if (staleArchivedListIds.has(listId)) {
				return { rows: [staleListRow(listId, { archived_at: 2 })] };
			}
		} else if (isListRead(statement)) {
			listListsReadCount += 1;
			if (shouldFailNextListListsRead) {
				shouldFailNextListListsRead = false;
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
				subscribeToChanges: (listener) => {
					changeListeners.add(listener);
					return {
						remove() {
							changeListeners.delete(listener);
						},
					};
				},
				close() {},
			},
		},
	);
	// Mirror production wiring (resource-manager.createSessionResource): the
	// session exposes lease-wrapped lists/items, so every Home read — including
	// the switcher's listLists() — exercises the lease wrapper at runtime.
	const lease = createSessionResourceLease({
		lists: dataServices.lists,
		items: dataServices.items,
		sync: dataServices.sync,
	});
	const syncCoordinator = passiveSyncCoordinator();
	const session: AuthenticatedAppSession = {
		user: {
			id: scenario.users.avery.id,
			email: scenario.users.avery.email ?? null,
			displayName: scenario.users.avery.displayName ?? null,
			firstName: scenario.users.avery.firstName ?? null,
			lastName: scenario.users.avery.lastName ?? null,
			onboardingCompletedAt: null,
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
			lists: lease.services.lists,
			items: lease.services.items,
			changes: dataServices.changes,
			sync: syncCoordinator,
		},
	};

	return {
		directory,
		household,
		scenario,
		session,
		requestSync: syncCoordinator.requestSync,
		listReadCount: () => listReadCount,
		listListsReadCount: () => listListsReadCount,
		getListReadCount: () => getListReadCount,
		fireChange() {
			for (const listener of changeListeners) {
				listener();
			}
		},
		failNextListRead() {
			shouldFailNextListRead = true;
		},
		failNextListListsRead() {
			shouldFailNextListListsRead = true;
		},
		setStaleMissingListIds(listIds) {
			staleMissingListIds = new Set(listIds);
		},
		setStaleDeletedListIds(listIds) {
			staleDeletedListIds = new Set(listIds);
		},
		setStaleArchivedListIds(listIds) {
			staleArchivedListIds = new Set(listIds);
		},
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
}

function isListRead(statement: HouseholdSqlStatement): boolean {
	return statement.kind === "read" && /FROM\s+lists/i.test(statement.sql);
}

function isGetListRead(statement: HouseholdSqlStatement): boolean {
	return isListRead(statement) && /WHERE id = \?/.test(statement.sql);
}

function staleListRow(
	listId: string,
	lifecycle: { archived_at?: number; deleted_at?: number },
): Record<string, unknown> {
	return {
		id: listId,
		name: "Stale",
		created_by_user_id: "usr_avery",
		created_at: 1,
		updated_at: 2,
		archived_at: lifecycle.archived_at ?? null,
		deleted_at: lifecycle.deleted_at ?? null,
	};
}

function homeListSwitcherSession({
	changes,
	listLists,
}: {
	changes: AuthenticatedAppSession["services"]["changes"];
	listLists: AuthenticatedAppSession["services"]["lists"]["listLists"];
}): AuthenticatedAppSession {
	const unusedServiceCall = async () => {
		throw new Error("Unexpected service call");
	};
	const lists: AuthenticatedAppSession["services"]["lists"] = {
		createList: unusedServiceCall,
		getList: unusedServiceCall,
		renameList: unusedServiceCall,
		deleteList: unusedServiceCall,
		listLists,
	};
	const items: AuthenticatedAppSession["services"]["items"] = {
		listItems: async () => [],
		addItem: unusedServiceCall,
		setItemChecked: unusedServiceCall,
	};

	return {
		user: {
			id: "usr_1",
			email: "member@example.com",
			displayName: "Member One",
			firstName: "Member",
			lastName: "One",
			onboardingCompletedAt: null,
		},
		activeHousehold: { id: "hh_1", name: "Test Household" },
		households: [
			{
				id: "hh_1",
				name: "Test Household",
				role: "owner",
				isActive: true,
			},
		],
		activeMember: {
			id: "mbr_1",
			userId: "usr_1",
			role: "owner",
			displayName: "Member One",
		},
		members: [
			{
				membershipId: "mbr_1",
				userId: "usr_1",
				role: "owner",
				displayName: "Member One",
			},
		],
		resourceKey: "authenticated-app-session:test",
		services: {
			lists,
			items,
			changes,
			sync: passiveSyncCoordinator(),
		},
	};
}

function passiveSyncCoordinator(): AuthenticatedAppSession["services"]["sync"] & {
	requestSync: jest.MockedFunction<
		AuthenticatedAppSession["services"]["sync"]["requestSync"]
	>;
} {
	return {
		getStatus: () => "synced",
		subscribe: () => ({ remove() {} }),
		requestSync: jest.fn<
			ReturnType<AuthenticatedAppSession["services"]["sync"]["requestSync"]>,
			Parameters<AuthenticatedAppSession["services"]["sync"]["requestSync"]>
		>(async () => null),
	};
}

function renderWithSafeArea(ui: ReactElement) {
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

async function openAddItemComposer() {
	await fireEvent.press(screen.getByLabelText("Add Item"));
}

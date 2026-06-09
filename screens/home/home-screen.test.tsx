import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import type { PropsWithChildren, ReactElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthenticatedAppSession } from "@/components/session";
import {
	type PrimaryHouseholdScenario,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { items, lists } from "@/db/schema/household";
import type { TestDirectoryDb, TestHouseholdDb } from "@/db/test";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import type { HouseholdSqlStatement } from "@/lib/services/household/household-store";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { createSessionDataServices } from "@/lib/services/session/services";
import { deferred } from "@/lib/test/async";
import { analyticsMocks } from "@/lib/test/mocks/analytics";
import { createMockLogger } from "@/lib/test/mocks/logger";
import { homeActiveListBoundaryKey } from "./home-current-list";

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn() }),
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

jest.mock("@expo/ui/swift-ui", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { Pressable, Text, View } =
		jest.requireActual<typeof import("react-native")>("react-native");

	return {
		BottomSheet: ({
			children,
			isPresented,
			onIsPresentedChange,
		}: {
			children: React.ReactNode;
			isPresented: boolean;
			onIsPresentedChange: (isPresented: boolean) => void;
		}) =>
			isPresented
				? React.createElement(
						View,
						{ accessibilityLabel: "List switcher sheet" },
						React.createElement(
							Pressable,
							{
								accessibilityLabel: "Dismiss List switcher",
								accessibilityRole: "button",
								onPress: () => onIsPresentedChange(false),
							},
							React.createElement(Text, null, "Dismiss"),
						),
						children,
					)
				: null,
		Group: ({ children }: { children: React.ReactNode }) =>
			React.createElement(React.Fragment, null, children),
		Host: ({
			children,
			style,
		}: {
			children: React.ReactNode;
			style?: StyleProp<ViewStyle>;
		}) => React.createElement(View, { style }, children),
		RNHostView: ({ children }: { children: React.ReactNode }) =>
			React.createElement(View, null, children),
	};
});

jest.mock("@expo/ui/swift-ui/modifiers", () => ({
	presentationDetents: jest.fn(() => ({ type: "presentationDetents" })),
	presentationDragIndicator: jest.fn(() => ({
		type: "presentationDragIndicator",
	})),
}));

const testLogger = createMockLogger();
const mockAsyncStorage = jest.mocked(AsyncStorage);
testLogger.with.mockReturnValue(testLogger);
const noopProviderActions = {
	retry() {},
	reloadSession() {},
	async signOut() {},
};

const { default: HomeScreen, HomeScreenView } = jest.requireActual<
	typeof import("@/screens/home/home-screen")
>("@/screens/home/home-screen");

beforeEach(() => {
	mockAsyncStorage.getItem.mockReset();
	mockAsyncStorage.setItem.mockReset();
	mockAsyncStorage.removeItem.mockReset();
	mockAsyncStorage.getItem.mockResolvedValue(null);
	mockAsyncStorage.setItem.mockResolvedValue(undefined);
	mockAsyncStorage.removeItem.mockResolvedValue(undefined);
	analyticsMocks.track.mockReset();
});

describe("HomeScreen", () => {
	beforeEach(() => {
		testLogger.debug.mockReset();
		testLogger.info.mockReset();
		testLogger.warn.mockReset();
		testLogger.error.mockReset();
		testLogger.with.mockClear();
		testLogger.with.mockImplementation(() => testLogger);
	});

	it("renders provider-derived loading state", () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			...noopProviderActions,
		});

		renderWithSafeArea(<HomeScreen />);

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
			renderWithSafeArea(<HomeScreen />);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy(), {
				timeout: 5_000,
			});
			expect(screen.getByText("Milk")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("wires retry and sign out actions from the provider", () => {
		const retry = jest.fn();
		const signOut = jest.fn(async () => undefined);
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: {
				status: "error",
				message: "Unable to prepare your Household. Please try again.",
			},
			session: null,
			retry,
			reloadSession() {},
			signOut,
		});

		renderWithSafeArea(<HomeScreen />);

		fireEvent.press(screen.getByText("Try again"));
		fireEvent.press(screen.getByText("Sign out"));
		expect(retry).toHaveBeenCalledTimes(1);
		expect(signOut).toHaveBeenCalledTimes(1);
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
		const { rerender } = renderWithSafeArea(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={firstHarness.session}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		rerender(
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
	it("shows Authenticated App Session loading and retryable error states", () => {
		const retry = jest.fn();

		const { rerender } = renderWithSafeArea(
			<HomeScreenView state={{ status: "loading" }} session={null} />,
		);
		expect(screen.getByText("Preparing your Household")).toBeTruthy();

		rerender(
			<HomeScreenView
				state={{
					status: "error",
					message: "Unable to prepare your Household. Please try again.",
				}}
				session={null}
				onRetry={retry}
			/>,
		);

		fireEvent.press(screen.getByText("Try again"));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("renders Active List data from seeded session services", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
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
			renderWithSafeArea(
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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("List unavailable")).toBeTruthy(),
			);
			fireEvent.press(screen.getByText("Try again"));

			await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
			expect(harness.listReadCount()).toBeGreaterThanOrEqual(2);
		} finally {
			await harness.close();
		}
	});

	it("renders the stored valid active Current List selection", async () => {
		const harness = await createHomeSessionHarness();
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(harness, harness.scenario.lists.pharmacy.id),
		);

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("falls back in memory to the most recently active List when no selection is stored", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
			expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("clears an invalid stored selection and does not persist the fallback", async () => {
		const harness = await createHomeSessionHarness();
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(harness, "lst_missing"),
		);

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(mockAsyncStorage.removeItem).toHaveBeenCalledTimes(1);
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("falls back from an archived stored selection", async () => {
		const archivedHarness = await createHomeSessionHarness();
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(
				archivedHarness,
				archivedHarness.scenario.lists.archivedCamping.id,
			),
		);

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={archivedHarness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("Camping")).toBeNull();
			expect(mockAsyncStorage.removeItem).toHaveBeenCalledTimes(1);
		} finally {
			await archivedHarness.close();
		}
	});

	it("falls back from a deleted stored selection", async () => {
		const deletedHarness = await createHomeSessionHarness();
		await deletedHarness.household.db
			.update(lists)
			.set({ deletedAt: 1_700_000_000_999 })
			.where(eq(lists.id, deletedHarness.scenario.lists.pharmacy.id));
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(
				deletedHarness,
				deletedHarness.scenario.lists.pharmacy.id,
			),
		);

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={deletedHarness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("Pharmacy")).toBeNull();
			expect(mockAsyncStorage.removeItem).toHaveBeenCalledTimes(1);
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
		} finally {
			await deletedHarness.close();
		}
	});

	it("excludes a stale active candidate and resolves the next active List", async () => {
		const harness = await createHomeSessionHarness();
		const originalGetList = harness.session.services.lists.getList;
		let shouldReturnStaleGroceries = true;
		harness.session.services.lists.getList = async (input) => {
			if (
				input.listId === harness.scenario.lists.groceries.id &&
				shouldReturnStaleGroceries
			) {
				shouldReturnStaleGroceries = false;
				return { status: "missing", listId: input.listId };
			}

			return originalGetList(input);
		};

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("Groceries")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("re-resolves when the post-resolution active List load returns missing", async () => {
		const harness = await createHomeSessionHarness();
		const originalGetList = harness.session.services.lists.getList;
		let groceriesReadCount = 0;
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(harness, harness.scenario.lists.groceries.id),
		);
		harness.session.services.lists.getList = async (input) => {
			if (input.listId === harness.scenario.lists.groceries.id) {
				groceriesReadCount += 1;
				if (groceriesReadCount === 2) {
					return { status: "missing", listId: input.listId };
				}
			}

			return originalGetList(input);
		};

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(mockAsyncStorage.removeItem).toHaveBeenCalledTimes(1);
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("re-resolves when the post-resolution active List load returns archived", async () => {
		const harness = await createHomeSessionHarness();
		const originalGetList = harness.session.services.lists.getList;
		let groceriesReadCount = 0;
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(harness, harness.scenario.lists.groceries.id),
		);
		harness.session.services.lists.getList = async (input) => {
			const result = await originalGetList(input);
			if (
				input.listId === harness.scenario.lists.groceries.id &&
				result.status === "available"
			) {
				groceriesReadCount += 1;
				if (groceriesReadCount === 2) {
					return {
						status: "available",
						list: {
							...result.list,
							name: "Archived Groceries",
							archived: true,
							archivedAt: 1_700_000_001_001,
						},
					};
				}
			}

			return result;
		};

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Archived Groceries")).toBeNull();
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(mockAsyncStorage.removeItem).toHaveBeenCalledTimes(1);
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("renders zero-active when the post-resolution active List load returns deleted and no fallback remains", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db
			.update(lists)
			.set({ archivedAt: 1_700_000_001_000 })
			.where(eq(lists.id, harness.scenario.lists.pharmacy.id));
		await harness.household.db
			.update(lists)
			.set({ archivedAt: 1_700_000_001_000 })
			.where(eq(lists.id, harness.scenario.lists.hardware.id));
		const originalGetList = harness.session.services.lists.getList;
		let groceriesReadCount = 0;
		harness.session.services.lists.getList = async (input) => {
			if (input.listId === harness.scenario.lists.groceries.id) {
				groceriesReadCount += 1;
				if (groceriesReadCount === 2) {
					return {
						status: "deleted",
						listId: input.listId,
						deletedAt: 1_700_000_001_001,
						updatedAt: 1_700_000_001_001,
					};
				}
			}

			return originalGetList(input);
		};

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(
				screen.getByText("Create a List to start adding Items."),
			).toBeTruthy();
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Groceries")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("renders a display-only zero-active state without Active List UI", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db
			.update(lists)
			.set({ archivedAt: 1_700_000_001_000 });

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(
				screen.getByText("Create a List to start adding Items."),
			).toBeTruthy();
			expect(screen.getByText("Avery Chen")).toBeTruthy();
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(screen.queryByText("Refresh")).toBeNull();
			expect(screen.queryByText("Synced")).toBeNull();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("uses session resource key and resolved List ID for the Active List boundary key", async () => {
		const harness = await createHomeSessionHarness({
			resourceKey: "authenticated-app-session:test-key",
		});

		try {
			expect(
				homeActiveListBoundaryKey(
					harness.session,
					harness.scenario.lists.pharmacy.id,
				),
			).toBe("authenticated-app-session:test-key:lst_seed_pharmacy");
		} finally {
			await harness.close();
		}
	});

	it("persists Item add and checked state against the resolved List", async () => {
		const harness = await createHomeSessionHarness();
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(harness, harness.scenario.lists.pharmacy.id),
		);

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			openAddItemComposer();
			fireEvent.changeText(screen.getByLabelText("Item name"), "Yogurt");
			fireEvent.changeText(screen.getByLabelText("Quantity"), "half carton");
			fireEvent.press(screen.getByLabelText("Add note"));
			fireEvent.changeText(screen.getByLabelText("Item note"), "Plain Greek");
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Submit Item"));
			});
			await waitFor(() => expect(screen.getByText("Yogurt")).toBeTruthy());
			expect(screen.getByText("half carton - Plain Greek")).toBeTruthy();
			await act(async () => {
				fireEvent.press(screen.getByRole("checkbox", { name: "Yogurt" }));
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

	it("opens and dismisses the active List switcher from the Current List header", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			expect(screen.getByLabelText("List switcher sheet")).toBeTruthy();

			fireEvent.press(screen.getByLabelText("Dismiss List switcher"));

			await waitFor(() =>
				expect(screen.queryByLabelText("List switcher sheet")).toBeNull(),
			);
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("loads active switcher summaries with current row indication and no searchText", async () => {
		const harness = await createHomeSessionHarness();
		const listLists = jest.spyOn(harness.session.services.lists, "listLists");

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();

			expect(
				screen.getByLabelText("Groceries, 1 unchecked, 2 checked, current"),
			).toBeTruthy();
			expect(screen.getByText("Current")).toBeTruthy();
			expect(
				screen.getByLabelText("Pharmacy, 0 unchecked, 0 checked"),
			).toBeTruthy();
			expect(
				screen.getByLabelText("Hardware Store, 0 unchecked, 0 checked"),
			).toBeTruthy();
			expect(screen.queryByText("Camping")).toBeNull();
			expect(listLists).toHaveBeenCalledWith({
				archive: "active",
				sort: "recentActivity",
			});
			expect(
				listLists.mock.calls.every(
					([input]) =>
						input !== undefined &&
						input?.archive === "active" &&
						input.sort === "recentActivity" &&
						!("searchText" in input),
				),
			).toBe(true);
		} finally {
			await harness.close();
		}
	});

	it("does nothing when the current List row is tapped", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(
				screen.getByLabelText("Groceries, 1 unchecked, 2 checked, current"),
			);

			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
			expect(harness.requestSync).not.toHaveBeenCalled();
			expect(screen.getByLabelText("List switcher sheet")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("persists a non-current switch before typed analytics, closes, and renders the selected List", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			await act(async () => {
				fireEvent.press(
					screen.getByLabelText("Pharmacy, 0 unchecked, 0 checked"),
				);
			});

			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(screen.queryByLabelText("List switcher sheet")).toBeNull();
			expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
				`dont-forget:current-list-selection:v1:${harness.scenario.users.avery.id}`,
				JSON.stringify({
					[harness.scenario.household.id]: harness.scenario.lists.pharmacy.id,
				}),
			);
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_switched", {
				household_id: harness.scenario.household.id,
				list_id: harness.scenario.lists.pharmacy.id,
				user_id: harness.scenario.users.avery.id,
			});
			expect(mockAsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
				analyticsMocks.track.mock.invocationCallOrder[0],
			);
			expect(harness.requestSync).not.toHaveBeenCalled();
			expect(harness.scenario.lists.groceries.id).toBe(DEFAULT_LIST_ID);
		} finally {
			await harness.close();
		}
	});

	it("does not emit list_switched for fallback Current List resolution", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("creates a List from the switcher, persists selection before Home updates, and does not emit list_switched", async () => {
		const harness = await createHomeSessionHarness();
		const getList = jest.spyOn(harness.session.services.lists, "getList");

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByText("Create List"));
			fireEvent.changeText(screen.getByLabelText("List name"), "Market");
			await act(async () => {
				const createButtons = screen.getAllByText("Create List");
				fireEvent.press(createButtons[createButtons.length - 1]);
			});

			await waitFor(() => expect(screen.getByText("Market")).toBeTruthy());
			expect(screen.getByText("No Items yet")).toBeTruthy();
			expect(screen.queryByLabelText("List switcher sheet")).toBeNull();

			const createdList = await harness.household.db.query.lists.findFirst({
				where: (table, { eq: equals }) => equals(table.name, "Market"),
			});
			expect(createdList).toBeDefined();
			if (!createdList) throw new Error("Expected created List");
			expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
				`dont-forget:current-list-selection:v1:${harness.scenario.users.avery.id}`,
				JSON.stringify({
					[harness.scenario.household.id]: createdList.id,
				}),
			);
			const createdListReadIndex = getList.mock.calls.findIndex(
				([input]) => input.listId === createdList.id,
			);
			expect(createdListReadIndex).toBeGreaterThanOrEqual(0);
			expect(mockAsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
				getList.mock.invocationCallOrder[createdListReadIndex],
			);
			expect(harness.requestSync).toHaveBeenCalledTimes(1);
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).toHaveBeenCalledWith("list_created", {
				household_id: harness.scenario.household.id,
				list_id: createdList.id,
				user_id: harness.scenario.users.avery.id,
			});
			expect(
				analyticsMocks.track.mock.calls.filter(
					([event]) => event === "list_created",
				),
			).toHaveLength(1);
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("creates a List from zero-active Home and recovers the Current List", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db
			.update(lists)
			.set({ archivedAt: 1_700_000_001_000 });

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			fireEvent.press(screen.getByText("Create List"));
			fireEvent.changeText(screen.getByLabelText("List name"), "Market");
			await act(async () => {
				const createButtons = screen.getAllByText("Create List");
				fireEvent.press(createButtons[createButtons.length - 1]);
			});

			await waitFor(() => expect(screen.getByText("Market")).toBeTruthy());
			expect(screen.queryByText("No active Lists")).toBeNull();
			expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("rejects invalid rename names without requesting sync", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Rename List Groceries"));
			fireEvent.changeText(screen.getByLabelText("List name"), "   ");
			await act(async () => {
				fireEvent.press(screen.getByText("Rename"));
			});
			expect(screen.getByText("Enter a List name.")).toBeTruthy();

			fireEvent.changeText(screen.getByLabelText("List name"), "a".repeat(81));
			await act(async () => {
				fireEvent.press(screen.getByText("Rename"));
			});
			expect(
				screen.getByText("List names must be 80 characters or fewer."),
			).toBeTruthy();
			expect(harness.requestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_renamed",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("treats unchanged trimmed rename as a no-op with no sync request", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Rename List Groceries"));
			fireEvent.changeText(screen.getByLabelText("List name"), " Groceries ");
			await act(async () => {
				fireEvent.press(screen.getByText("Rename"));
			});

			await waitFor(() =>
				expect(
					screen.getByLabelText("Groceries, 1 unchecked, 2 checked, current"),
				).toBeTruthy(),
			);
			expect(harness.requestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_renamed",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("renames the current List and updates the Home header", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Rename List Groceries"));
			fireEvent.changeText(screen.getByLabelText("List name"), "Market");
			await act(async () => {
				fireEvent.press(screen.getByText("Rename"));
			});

			await waitFor(() =>
				expect(screen.getByLabelText("Current List Market")).toBeTruthy(),
			);
			expect(screen.queryByLabelText("Current List Groceries")).toBeNull();
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(
				analyticsMocks.track.mock.calls.filter(
					([event]) => event === "list_renamed",
				),
			).toHaveLength(1);
		} finally {
			await harness.close();
		}
	});

	it("renames a non-current List and refreshes switcher rows", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Rename List Pharmacy"));
			fireEvent.changeText(screen.getByLabelText("List name"), "Supplements");
			await act(async () => {
				fireEvent.press(screen.getByText("Rename"));
			});

			await waitFor(() =>
				expect(
					screen.getByLabelText("Supplements, 0 unchecked, 0 checked"),
				).toBeTruthy(),
			);
			expect(screen.getByLabelText("Current List Groceries")).toBeTruthy();
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(
				analyticsMocks.track.mock.calls.filter(
					([event]) => event === "list_renamed",
				),
			).toHaveLength(1);
		} finally {
			await harness.close();
		}
	});

	it("shows a scoped lifecycle message when rename target is missing", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Rename List Pharmacy"));
			await harness.household.db
				.delete(lists)
				.where(eq(lists.id, harness.scenario.lists.pharmacy.id));
			fireEvent.changeText(screen.getByLabelText("List name"), "Supplements");
			await act(async () => {
				fireEvent.press(screen.getByText("Rename"));
			});

			expect(
				screen.getByText("This List is no longer available."),
			).toBeTruthy();
			expect(harness.requestSync).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
	});

	it("deletes a non-current List, preserves Current List, and refreshes rows", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Delete List Pharmacy"));
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Confirm Delete List Pharmacy"));
			});

			await waitFor(() => expect(screen.queryByText("Pharmacy")).toBeNull());
			expect(screen.getByLabelText("Current List Groceries")).toBeTruthy();
			expect(screen.getByLabelText("List switcher sheet")).toBeTruthy();
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(
				analyticsMocks.track.mock.calls.filter(
					([event]) => event === "list_deleted",
				),
			).toHaveLength(1);
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("deletes the current List and persists the active fallback without list_switched", async () => {
		const harness = await createHomeSessionHarness();
		const activeLists = await harness.session.services.lists.listLists({
			archive: "active",
			sort: "recentActivity",
		});
		const fallback = activeLists.find(
			(summary) => summary.id !== harness.scenario.lists.groceries.id,
		);
		if (!fallback) throw new Error("Expected fallback List");

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Delete List Groceries"));
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Confirm Delete List Groceries"));
			});

			await waitFor(() => expect(screen.getByText(fallback.name)).toBeTruthy());
			expect(screen.queryByLabelText("List switcher sheet")).toBeNull();
			expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
				`dont-forget:current-list-selection:v1:${harness.scenario.users.avery.id}`,
				JSON.stringify({
					[harness.scenario.household.id]: fallback.id,
				}),
			);
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("does not log a stale active List reload failure when current delete sync completes", async () => {
		const syncAfterWrite = deferred<void>();
		const syncCoordinator = controllableHomeSyncCoordinator("synced");
		syncCoordinator.requestSync.mockImplementationOnce(async () => {
			syncCoordinator.emit("pending");
			await syncAfterWrite.promise;
			syncCoordinator.emit("synced");
			return { changed: true };
		});
		const harness = await createHomeSessionHarness({ syncCoordinator });
		const getList = jest.spyOn(harness.session.services.lists, "getList");
		const activeLists = await harness.session.services.lists.listLists({
			archive: "active",
			sort: "recentActivity",
		});
		const fallback = activeLists.find(
			(summary) => summary.id !== harness.scenario.lists.groceries.id,
		);
		if (!fallback) throw new Error("Expected fallback List");

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Delete List Groceries"));
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Confirm Delete List Groceries"));
			});

			await waitFor(() => expect(screen.getByText(fallback.name)).toBeTruthy());
			await waitFor(() => expect(harness.requestSync).toHaveBeenCalledTimes(1));
			const fallbackReadIndex = getList.mock.calls.findIndex(
				([input]) => input.listId === fallback.id,
			);
			expect(fallbackReadIndex).toBeGreaterThanOrEqual(0);
			expect(getList.mock.invocationCallOrder[fallbackReadIndex]).toBeLessThan(
				harness.requestSync.mock.invocationCallOrder[0],
			);

			await act(async () => {
				syncAfterWrite.resolve();
				await syncAfterWrite.promise;
			});

			expect(testLogger.error).not.toHaveBeenCalledWith(
				"active list reload after sync failed",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("deletes the last active current List, clears selection, and renders zero-active", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db
			.update(lists)
			.set({ archivedAt: 1_700_000_001_000 })
			.where(eq(lists.id, harness.scenario.lists.pharmacy.id));
		await harness.household.db
			.update(lists)
			.set({ archivedAt: 1_700_000_001_000 })
			.where(eq(lists.id, harness.scenario.lists.hardware.id));
		mockAsyncStorage.getItem.mockResolvedValue(
			currentListSelectionPayload(harness, harness.scenario.lists.groceries.id),
		);

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Delete List Groceries"));
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Confirm Delete List Groceries"));
			});

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(screen.getByText("Create List")).toBeTruthy();
			expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
				`dont-forget:current-list-selection:v1:${harness.scenario.users.avery.id}`,
			);
			expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
			expect(harness.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			});
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_switched",
				expect.anything(),
			);
		} finally {
			await harness.close();
		}
	});

	it("does not request sync for an already-deleted delete no-op", async () => {
		const harness = await createHomeSessionHarness();

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await openCurrentListSwitcher();
			fireEvent.press(screen.getByLabelText("Delete List Pharmacy"));
			await harness.household.db
				.update(lists)
				.set({ deletedAt: 1_700_000_002_000 })
				.where(eq(lists.id, harness.scenario.lists.pharmacy.id));
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Confirm Delete List Pharmacy"));
			});

			expect(screen.getByText("This List was already deleted.")).toBeTruthy();
			expect(harness.requestSync).not.toHaveBeenCalled();
			expect(analyticsMocks.track).not.toHaveBeenCalledWith(
				"list_deleted",
				expect.anything(),
			);
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
			const { rerender } = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={staleHarness.session}
				/>,
			);

			rerender(
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
});

type HomeSessionHarness = {
	directory: TestDirectoryDb;
	household: TestHouseholdDb;
	scenario: PrimaryHouseholdScenario;
	session: AuthenticatedAppSession;
	listReadCount: () => number;
	requestSync: jest.MockedFunction<
		AuthenticatedAppSession["services"]["sync"]["requestSync"]
	>;
	close: () => Promise<void>;
};

type HomeSessionHarnessOptions = {
	failNextListRead?: boolean;
	listName?: string;
	listReadGate?: Promise<void>;
	resourceKey?: string;
	syncCoordinator?: HomeTestSyncCoordinator;
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
	let shouldFailNextListRead = options.failNextListRead ?? false;
	const execute = async (statement: HouseholdSqlStatement) => {
		if (isListRead(statement)) {
			listReadCount += 1;
			await options.listReadGate;
			if (shouldFailNextListRead) {
				shouldFailNextListRead = false;
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
	const syncCoordinator = options.syncCoordinator ?? passiveSyncCoordinator();
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
			lists: dataServices.lists,
			items: dataServices.items,
			sync: syncCoordinator,
		},
	};

	return {
		directory,
		household,
		scenario,
		session,
		listReadCount: () => listReadCount,
		requestSync: syncCoordinator.requestSync,
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

function passiveSyncCoordinator(): AuthenticatedAppSession["services"]["sync"] & {
	requestSync: jest.MockedFunction<
		AuthenticatedAppSession["services"]["sync"]["requestSync"]
	>;
} {
	const requestSync = jest.fn<
		ReturnType<AuthenticatedAppSession["services"]["sync"]["requestSync"]>,
		Parameters<AuthenticatedAppSession["services"]["sync"]["requestSync"]>
	>(async () => null);

	return {
		getStatus: () => "synced",
		subscribe: () => ({ remove() {} }),
		requestSync,
	};
}

type HomeTestSyncCoordinator = AuthenticatedAppSession["services"]["sync"] & {
	requestSync: jest.MockedFunction<
		AuthenticatedAppSession["services"]["sync"]["requestSync"]
	>;
	emit: (
		status: ReturnType<
			AuthenticatedAppSession["services"]["sync"]["getStatus"]
		>,
	) => void;
};

function controllableHomeSyncCoordinator(
	initialStatus: ReturnType<
		AuthenticatedAppSession["services"]["sync"]["getStatus"]
	>,
): HomeTestSyncCoordinator {
	let status = initialStatus;
	const listeners = new Set<
		(
			status: ReturnType<
				AuthenticatedAppSession["services"]["sync"]["getStatus"]
			>,
		) => void
	>();
	const requestSync = jest.fn<
		ReturnType<AuthenticatedAppSession["services"]["sync"]["requestSync"]>,
		Parameters<AuthenticatedAppSession["services"]["sync"]["requestSync"]>
	>(async () => null);

	return {
		getStatus: () => status,
		subscribe(listener) {
			listeners.add(listener);
			return {
				remove() {
					listeners.delete(listener);
				},
			};
		},
		requestSync,
		emit(nextStatus) {
			status = nextStatus;
			for (const listener of listeners) {
				listener(status);
			}
		},
	};
}

function renderWithSafeArea(ui: ReactElement) {
	return render(ui, { wrapper: TestSafeAreaProvider });
}

function currentListSelectionPayload(
	harness: HomeSessionHarness,
	listId: string,
): string {
	return JSON.stringify({
		[harness.scenario.household.id]: listId,
	});
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

function openAddItemComposer() {
	fireEvent.press(screen.getByLabelText("Add Item"));
}

async function openCurrentListSwitcher() {
	await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
	fireEvent.press(screen.getByLabelText("Current List Groceries"));
	await waitFor(() =>
		expect(
			screen.getByLabelText("Groceries, 1 unchecked, 2 checked, current"),
		).toBeTruthy(),
	);
}

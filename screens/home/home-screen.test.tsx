import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { eq } from "drizzle-orm";
import type { PropsWithChildren, ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthenticatedAppSession } from "@/components/session";
import {
	type PrimaryHouseholdScenario,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import { items, lists } from "@/db/schema/household";
import type { TestDirectoryDb, TestHouseholdDb } from "@/db/test";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import { track } from "@/lib/analytics";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import {
	clearCurrentListSelection,
	getCurrentListSelection,
	setCurrentListSelection,
} from "@/lib/local-storage/current-list-selection";
import type { HouseholdSqlStatement } from "@/lib/services/household/household-store";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { createSessionResourceLease } from "@/lib/services/session/resource-lease";
import { createSessionDataServices } from "@/lib/services/session/services";
import { deferred } from "@/lib/test/async";
import { createMockLogger } from "@/lib/test/mocks/logger";

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/lib/local-storage/current-list-selection", () => ({
	getCurrentListSelection: jest.fn(),
	setCurrentListSelection: jest.fn(),
	clearCurrentListSelection: jest.fn(),
	clearUserCurrentListSelections: jest.fn(),
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

// The real @expo/ui swift-ui module evaluates `requireNativeModule("ExpoUI")`
// at import time, which jest-expo cannot satisfy. The shell is native-only
// behavior (covered by simulator QA); these pass-throughs keep the Home-owned
// switcher logic fully testable, including native dismissal via the captured
// BottomSheet props.
const mockBottomSheet: {
	lastProps: {
		isPresented: boolean;
		onIsPresentedChange: (isPresented: boolean) => void;
	} | null;
} = { lastProps: null };

jest.mock("@expo/ui/swift-ui", () => {
	const ReactActual = jest.requireActual<typeof import("react")>("react");
	const { View } =
		jest.requireActual<typeof import("react-native")>("react-native");
	const passthrough = ({ children }: { children?: ReactNode }) =>
		ReactActual.createElement(View, null, children);
	return {
		Host: passthrough,
		Group: passthrough,
		RNHostView: passthrough,
		BottomSheet: (props: {
			children?: ReactNode;
			isPresented: boolean;
			onIsPresentedChange: (isPresented: boolean) => void;
		}) => {
			mockBottomSheet.lastProps = props;
			return ReactActual.createElement(View, null, props.children);
		},
	};
});

jest.mock("@expo/ui/swift-ui/modifiers", () => ({
	presentationDetents: jest.fn(() => ({ $type: "presentationDetents" })),
	presentationDragIndicator: jest.fn(() => ({
		$type: "presentationDragIndicator",
	})),
}));

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

beforeEach(() => {
	jest.mocked(getCurrentListSelection).mockReset().mockResolvedValue(null);
	jest.mocked(setCurrentListSelection).mockReset().mockResolvedValue(undefined);
	jest
		.mocked(clearCurrentListSelection)
		.mockReset()
		.mockResolvedValue(undefined);
	jest.mocked(track).mockClear();
	mockBottomSheet.lastProps = null;
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

	it("renders the stored active Current List selection after resolution", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(getCurrentListSelection)
			.mockResolvedValue(harness.scenario.lists.pharmacy.id);

		try {
			renderWithSafeArea(
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
			renderWithSafeArea(
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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(clearCurrentListSelection).toHaveBeenCalledTimes(1);
			expect(clearCurrentListSelection).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("Holiday Dinner")).toBeNull();
			expect(clearCurrentListSelection).toHaveBeenCalledTimes(1);
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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("Camping Trip")).toBeNull();
			expect(clearCurrentListSelection).toHaveBeenCalledTimes(1);
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
			renderWithSafeArea(
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
			renderWithSafeArea(
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
			.mocked(clearCurrentListSelection)
			.mockRejectedValueOnce(new Error("storage offline"));

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

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(clearCurrentListSelection).toHaveBeenCalledTimes(2);
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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.queryByText("List unavailable")).toBeNull();
			expect(screen.queryByText("Try again")).toBeNull();
			expect(clearCurrentListSelection).toHaveBeenCalledTimes(1);
			expect(clearCurrentListSelection).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
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
			renderWithSafeArea(
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

	it("renders a display-only zero-active state when no active Lists exist", async () => {
		const harness = await createHomeSessionHarness();
		await harness.household.db.update(lists).set({ deletedAt: 1 });

		try {
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
					onSignOut={() => {}}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(
				screen.getByText("Create a List to start adding Items."),
			).toBeTruthy();
			// Signed-in Member bar stays visible.
			expect(screen.getByText("Signed in")).toBeTruthy();
			expect(screen.getByText("Avery Chen")).toBeTruthy();
			// No Active List UI: items, add-Item form, refresh, sync status,
			// retry, or create actions.
			expect(screen.queryByText("Groceries")).toBeNull();
			expect(screen.queryByText("Milk")).toBeNull();
			expect(screen.queryByLabelText("Add Item")).toBeNull();
			expect(screen.queryByText("Refresh")).toBeNull();
			expect(screen.queryByText("Synced")).toBeNull();
			expect(screen.queryByText("Try again")).toBeNull();
			expect(screen.queryByText(/Create List/i)).toBeNull();
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
			const { rerender } = renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			openAddItemComposer();
			fireEvent.changeText(screen.getByLabelText("Item name"), "Snacks");
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Submit Item"));
			});
			await waitFor(() => expect(screen.getByText("Snacks")).toBeTruthy());

			jest
				.mocked(getCurrentListSelection)
				.mockResolvedValue(harness.scenario.lists.groceries.id);
			// Same resourceKey, new session identity: re-resolution changes only
			// the resolved List ID, which must remount the Active List boundary.
			rerender(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={{ ...harness.session }}
				/>,
			);

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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("No active Lists")).toBeTruthy(),
			);
			expect(clearCurrentListSelection).toHaveBeenCalledTimes(1);
			expect(clearCurrentListSelection).toHaveBeenCalledWith(
				harness.scenario.users.avery.id,
				harness.scenario.household.id,
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
			renderWithSafeArea(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

			openAddItemComposer();
			fireEvent.changeText(screen.getByLabelText("Item name"), "Lantern");
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Submit Item"));
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
	async function renderHomeReady(harness: HomeSessionHarness) {
		renderWithSafeArea(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={harness.session}
			/>,
		);
		await waitFor(() =>
			expect(screen.getByLabelText("Switch List")).toBeTruthy(),
		);
	}

	function openSwitcher() {
		fireEvent.press(screen.getByLabelText("Switch List"));
	}

	it("opens from the Current List header and lists only active List summaries", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderHomeReady(harness);
			openSwitcher();

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
			openSwitcher();

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
			openSwitcher();
			await waitFor(() => expect(screen.getByText("Current")).toBeTruthy());

			await act(async () => {
				fireEvent.press(
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
			openSwitcher();
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
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

			openAddItemComposer();
			fireEvent.changeText(screen.getByLabelText("Item name"), "Bandages");
			await act(async () => {
				fireEvent.press(screen.getByLabelText("Submit Item"));
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

	it("does not emit list_switched when selection persistence fails", async () => {
		const harness = await createHomeSessionHarness();
		jest
			.mocked(setCurrentListSelection)
			.mockRejectedValueOnce(new Error("storage offline"));

		try {
			await renderHomeReady(harness);
			openSwitcher();
			await waitFor(() => expect(screen.getByText("Pharmacy")).toBeTruthy());

			await act(async () => {
				fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
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
				fireEvent.press(screen.getByRole("button", { name: "Pharmacy" }));
			});
			expect(listSwitchedTrackCalls()).toHaveLength(1);
		} finally {
			await harness.close();
		}
	});

	it("dismisses natively and reopens from the header without persistence or analytics", async () => {
		const harness = await createHomeSessionHarness();

		try {
			await renderHomeReady(harness);
			openSwitcher();
			await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());

			// Native dismissal (swipe down / scrim tap) reports isPresented=false.
			act(() => {
				mockBottomSheet.lastProps?.onIsPresentedChange(false);
			});

			expect(screen.queryByText("Hardware")).toBeNull();
			expect(setCurrentListSelection).not.toHaveBeenCalled();
			expect(listSwitchedTrackCalls()).toHaveLength(0);
			expect(harness.requestSync).not.toHaveBeenCalled();

			// The header opens the switcher again after dismissal.
			openSwitcher();
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
			openSwitcher();

			await waitFor(() =>
				expect(
					screen.getByText("Unable to load your Lists. Please try again."),
				).toBeTruthy(),
			);
			fireEvent.press(screen.getByText("Try again"));

			await waitFor(() => expect(screen.getByText("Hardware")).toBeTruthy());
			expect(listSwitchedTrackCalls()).toHaveLength(0);
			expect(setCurrentListSelection).not.toHaveBeenCalled();
		} finally {
			await harness.close();
		}
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

function openAddItemComposer() {
	fireEvent.press(screen.getByLabelText("Add Item"));
}

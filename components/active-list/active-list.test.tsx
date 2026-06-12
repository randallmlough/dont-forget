import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { useState } from "react";
import { Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
	ActiveList,
	type ActiveListState,
	type ActiveListSyncCoordinator,
} from "@/components/active-list";
import {
	type ActiveListMemoryActions,
	createActiveListMemoryActions,
} from "@/components/active-list/test-support";
import { ADD_ITEM_COMPOSER_SCROLL_CLEARANCE } from "@/components/add-item-composer";
import { useLogger } from "@/lib/logger";
import { deferred } from "@/lib/test/async";
import { createMockLogger, type MockLogger } from "@/lib/test/mocks/logger";

let mockLogger: MockLogger;

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

beforeEach(() => {
	mockLogger = createMockLogger();
	mockLogger.with.mockReturnValue(mockLogger);
	jest.mocked(useLogger).mockReturnValue(mockLogger);
});

const emptyList: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

type TestSyncCoordinator = Omit<ActiveListSyncCoordinator, "requestSync"> & {
	requestSync: jest.MockedFunction<ActiveListSyncCoordinator["requestSync"]>;
	emit: (status: ReturnType<ActiveListSyncCoordinator["getStatus"]>) => void;
};

describe("ActiveList", () => {
	it("adds and checks an Item for the current Member", async () => {
		await renderActiveList(emptyList);

		expect(screen.getByText("Avery")).toBeTruthy();
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("No Items yet")).toBeTruthy();
		expect(
			screen.getByText("This List is empty.", { includeHiddenElements: true }),
		).toBeTruthy();
		expect(screen.getByLabelText("Add Item")).toBeTruthy();
		expect(screen.queryByLabelText("Submit Item")).toBeNull();

		await openAddItemComposer();
		expect(screen.getByLabelText("Quantity")).toBeTruthy();
		expect(screen.getByLabelText("Add note")).toBeTruthy();
		expect(screen.getByLabelText("Add note").props.accessibilityState).toEqual({
			selected: false,
		});
		expect(screen.getByLabelText("Selected List: Groceries")).toBeTruthy();

		const input = screen.getByLabelText("Item name");
		await fireEvent.changeText(input, " Milk ");
		await fireEvent.changeText(screen.getByLabelText("Quantity"), "1 gallon");
		await fireEvent.press(screen.getByLabelText("Add note"));
		expect(screen.getByLabelText("Add note").props.accessibilityState).toEqual({
			selected: true,
		});
		await fireEvent.changeText(
			screen.getByLabelText("Item note"),
			"Organic if easy",
		);
		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() => {
			expect(
				screen.getByRole("checkbox", { name: /^Milk\b/ }).props
					.accessibilityState,
			).toEqual({
				checked: false,
			});
		});
		expect(screen.getByText("0 of 1 Items checked")).toBeTruthy();
		expect(screen.getByText("1 gallon - Organic if easy")).toBeTruthy();
		expect(screen.queryByText("This List is empty.")).toBeNull();
		expect(screen.queryByLabelText("Item name")).toBeNull();
		expect(screen.getByLabelText("Add Item")).toBeTruthy();

		await act(async () => {
			await fireEvent.press(screen.getByRole("checkbox", { name: /^Milk\b/ }));
		});

		await waitFor(() => {
			expect(
				screen.getByRole("checkbox", { name: /^Milk\b/ }).props
					.accessibilityState,
			).toEqual({
				checked: true,
			});
		});
		expect(screen.getByText("1 of 1 Items checked")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
	});

	it("opens the add Item composer", async () => {
		await renderActiveList(emptyList);
		await openAddItemComposer();

		expect(screen.getByLabelText("Item name")).toBeTruthy();
		expect(screen.getByLabelText("Add Item composer").props).toMatchObject({
			accessibilityViewIsModal: true,
		});
		expect(screen.getByLabelText("Submit Item")).toBeTruthy();
		expect(screen.getByLabelText("Quantity")).toBeTruthy();
		expect(screen.getByLabelText("Add note")).toBeTruthy();
		expect(screen.getByLabelText("Selected List: Groceries")).toBeTruthy();
		expect(screen.queryByLabelText("Add Item")).toBeNull();
	});

	it("reserves bottom scroll space for the add Item composer", async () => {
		const rendered = await renderActiveList(emptyList);
		const list = rendered.root?.queryAll(
			(instance) => instance.type === "RCTScrollView",
		)[0];

		expect(list?.props.contentContainerStyle).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					paddingBottom: 34 + ADD_ITEM_COMPOSER_SCROLL_CLEARANCE,
				}),
			]),
		);
	});

	it("reserves keyboard-aware bottom scroll space while composing", async () => {
		const keyboard = captureKeyboardListeners();
		try {
			const rendered = await renderActiveList(emptyList);

			await act(() => {
				keyboard.emit("keyboardWillShow", 320);
			});

			const list = rendered.root?.queryAll(
				(instance) => instance.type === "RCTScrollView",
			)[0];
			expect(list?.props.contentContainerStyle).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						paddingBottom: 320 + ADD_ITEM_COMPOSER_SCROLL_CLEARANCE,
					}),
				]),
			);
		} finally {
			keyboard.restore();
		}
	});

	it("dismisses the composer without clearing an open draft", async () => {
		await renderActiveList(emptyList);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await fireEvent.changeText(screen.getByLabelText("Quantity"), "1, 1 dozen");
		await fireEvent.press(
			screen.getByRole("button", { name: "Dismiss add Item composer" }),
		);

		expect(screen.queryByLabelText("Item name")).toBeNull();

		await openAddItemComposer();
		expect(screen.getByLabelText("Item name").props.value).toBe("Milk");
		expect(screen.getByLabelText("Quantity").props.value).toBe("1, 1 dozen");
	});

	it("keeps the composer open when the keyboard hides", async () => {
		const keyboard = captureKeyboardListeners();
		try {
			await renderActiveList(emptyList);

			await openAddItemComposer();
			await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");

			await act(() => {
				keyboard.emit("keyboardWillHide");
			});

			expect(screen.getByLabelText("Item name").props.value).toBe("Milk");
			expect(screen.getByLabelText("Submit Item")).toBeTruthy();
		} finally {
			keyboard.restore();
		}
	});

	it("clears composer fields after submit", async () => {
		await renderActiveList(emptyList);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await fireEvent.changeText(screen.getByLabelText("Quantity"), "dozen");
		await fireEvent.press(screen.getByLabelText("Add note"));
		await fireEvent.changeText(
			screen.getByLabelText("Item note"),
			"Organic if easy",
		);

		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		await openAddItemComposer();
		expect(screen.getByLabelText("Item name").props.value).toBe("");
		expect(screen.getByLabelText("Quantity").props.value).toBe("");
		expect(screen.queryByLabelText("Item note")).toBeNull();
	});

	it("shows an error and keeps prior rows when adding an Item fails", async () => {
		const actions = memoryListActions(emptyList, {
			addItem: jest.fn().mockRejectedValue(new Error("write failed")),
		});
		await renderActiveList(emptyList, actions);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await fireEvent.changeText(screen.getByLabelText("Quantity"), "1 gallon");
		await fireEvent.press(screen.getByLabelText("Add note"));
		await fireEvent.changeText(
			screen.getByLabelText("Item note"),
			"Organic if easy",
		);

		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() =>
			expect(
				screen.getByText("Unable to save that Item. Please try again."),
			).toBeTruthy(),
		);
		expect(screen.queryByRole("checkbox", { name: "Milk" })).toBeNull();
		expect(
			screen.getByText("This List is empty.", { includeHiddenElements: true }),
		).toBeTruthy();
		expect(screen.getByLabelText("Item name").props.value).toBe("Milk");
		expect(screen.getByLabelText("Quantity").props.value).toBe("1 gallon");
		expect(screen.getByLabelText("Item note").props.value).toBe(
			"Organic if easy",
		);
	});

	it("does not submit a note after the note field is toggled off", async () => {
		const addItem: ActiveListMemoryActions["addItem"] = jest.fn(
			async () => undefined,
		);
		await renderActiveList(
			emptyList,
			memoryListActions(emptyList, { addItem }),
		);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await fireEvent.press(screen.getByLabelText("Add note"));
		await fireEvent.changeText(
			screen.getByLabelText("Item note"),
			"Organic if easy",
		);
		await fireEvent.press(screen.getByLabelText("Add note"));

		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() =>
			expect(addItem).toHaveBeenCalledWith({
				name: "Milk",
				quantity: null,
				notes: null,
			}),
		);
		expect(screen.queryByText("Organic if easy")).toBeNull();
	});

	it("does not add a local row when adding an Item fails", async () => {
		const actions = memoryListActions(emptyList, {
			addItem: jest.fn().mockRejectedValue(new Error("write failed")),
		});
		await renderActiveList(emptyList, actions);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");

		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() =>
			expect(
				screen.getByText("Unable to save that Item. Please try again."),
			).toBeTruthy(),
		);
		expect(screen.queryByRole("checkbox", { name: "Milk" })).toBeNull();
		expect(
			screen.getByText("This List is empty.", { includeHiddenElements: true }),
		).toBeTruthy();
	});

	it("shows pending and offline sync without discarding local Item changes", async () => {
		const syncAfterWrite = deferred<{ changed: boolean }>();
		const coordinator = controllableSyncCoordinator("synced");
		coordinator.requestSync.mockImplementationOnce(async () => {
			coordinator.emit("pending");
			await syncAfterWrite.promise.catch(() => undefined);
			coordinator.emit("offline");
			return null;
		});

		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() => expect(screen.getByText("Pending sync")).toBeTruthy());

		await act(async () => {
			syncAfterWrite.reject(new TypeError("Network request failed"));
		});

		await waitFor(() =>
			expect(screen.getByText("Offline - changes saved locally")).toBeTruthy(),
		);
		expect(screen.getByRole("checkbox", { name: "Milk" })).toBeTruthy();
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("shows offline sync state when sync is not authorized", async () => {
		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			passiveSyncCoordinator("offline"),
		);

		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
	});

	it("samples sync status after subscribing", async () => {
		const coordinator = syncCoordinatorWithPostSubscribeStatus("offline");

		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);

		expect(coordinator.subscribe).toHaveBeenCalled();
		expect(
			await screen.findByText("Offline - changes saved locally"),
		).toBeTruthy();
		expect(coordinator.getStatus).toHaveBeenCalled();
	});

	it("requests local-write sync after adding an Item", async () => {
		const coordinator = controllableSyncCoordinator("synced");

		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});

		await waitFor(() =>
			expect(coordinator.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			}),
		);
	});

	it("requests manual sync when refreshing the List view", async () => {
		const coordinator = controllableSyncCoordinator("synced");
		const refreshSync = deferred<{ changed: boolean }>();

		coordinator.requestSync.mockImplementationOnce(async () => {
			coordinator.emit("pending");
			await refreshSync.promise;
			coordinator.emit("synced");
			return { changed: true };
		});

		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);

		await act(async () => {
			void fireEvent.press(screen.getByText("Refresh"));
		});
		expect(screen.getByText("Refreshing")).toBeTruthy();

		await act(async () => {
			refreshSync.resolve({ changed: true });
		});

		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
		expect(coordinator.requestSync).toHaveBeenCalledWith({
			reason: "manualRefresh",
		});
		expect(screen.getByText("Refresh")).toBeTruthy();
	});

	it("updates the sync status pill when coordinator-owned sync completes", async () => {
		const coordinator = controllableSyncCoordinator("synced");

		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);
		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());

		await act(async () => {
			coordinator.emit("pending");
		});
		await waitFor(() => expect(screen.getByText("Pending sync")).toBeTruthy());

		await act(async () => {
			coordinator.emit("synced");
			await Promise.resolve();
		});

		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
		expect(
			screen.getByText("This List is empty.", { includeHiddenElements: true }),
		).toBeTruthy();
	});

	it("reports manual refresh failure when sync fails unexpectedly", async () => {
		const syncError = new Error("remote unavailable");
		const coordinator = controllableSyncCoordinator("synced");
		coordinator.requestSync.mockImplementationOnce(async () => {
			coordinator.emit("pending");
			coordinator.emit("failed");
			throw syncError;
		});

		await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);
		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());

		await act(async () => {
			await fireEvent.press(screen.getByText("Refresh"));
		});

		await waitFor(() =>
			expect(
				screen.getByText("Unable to refresh this List. Please try again."),
			).toBeTruthy(),
		);
		expect(
			screen.getByText("Sync failed - changes saved locally"),
		).toBeTruthy();
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("does not update after local-write sync completes after unmount", async () => {
		const syncAfterWrite = deferred<{ changed: boolean }>();
		const coordinator = controllableSyncCoordinator("synced");
		coordinator.requestSync.mockImplementationOnce(async () => {
			await syncAfterWrite.promise;
			return { changed: true };
		});
		const { unmount } = await renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);

		await openAddItemComposer();
		await fireEvent.changeText(screen.getByLabelText("Item name"), "Milk");
		await act(async () => {
			await fireEvent.press(screen.getByLabelText("Submit Item"));
		});
		await waitFor(() =>
			expect(coordinator.requestSync).toHaveBeenCalledTimes(1),
		);

		await unmount();
		await act(async () => {
			syncAfterWrite.resolve({ changed: true });
			await Promise.resolve();
		});

		expect(coordinator.requestSync).toHaveBeenCalledTimes(1);
	});
});

function renderActiveList(
	initialState: ActiveListState,
	actions = memoryListActions(initialState),
	syncCoordinator = passiveSyncCoordinator(),
) {
	function ActiveListTestHarness() {
		const [state, setState] = useState(initialState);

		return (
			<ActiveList.Provider
				state={state}
				currentMemberName="Avery Chen"
				onAddItem={async (input) => {
					await actions.addItem(input);
					setState(await actions.load());
				}}
				onSetItemChecked={async (itemId, checked) => {
					await actions.setItemChecked(itemId, checked);
					setState(await actions.load());
				}}
				syncCoordinator={syncCoordinator}
			>
				<ActiveList.Screen>
					<ActiveList.Header />
					<ActiveList.Items />
					<ActiveList.AddItemForm />
				</ActiveList.Screen>
			</ActiveList.Provider>
		);
	}

	return render(
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<ActiveListTestHarness />
		</SafeAreaProvider>,
	);
}

async function openAddItemComposer() {
	await fireEvent.press(screen.getByLabelText("Add Item"));
}

function captureKeyboardListeners() {
	const addListener = Keyboard.addListener.bind(Keyboard);
	const listeners = new Map<
		string,
		((event: {
			duration: number;
			endCoordinates: { height: number };
		}) => void)[]
	>();
	const spy = jest
		.spyOn(Keyboard, "addListener")
		.mockImplementation((eventName, listener) => {
			const eventListeners = listeners.get(eventName) ?? [];
			eventListeners.push(
				listener as (event: {
					duration: number;
					endCoordinates: { height: number };
				}) => void,
			);
			listeners.set(eventName, eventListeners);
			return addListener(eventName, listener);
		});

	return {
		emit(eventName: string, height = 0) {
			for (const listener of listeners.get(eventName) ?? []) {
				listener({
					duration: 0,
					endCoordinates: { height },
				});
			}
		},
		restore() {
			spy.mockRestore();
		},
	};
}

function passiveSyncCoordinator(
	status: ReturnType<ActiveListSyncCoordinator["getStatus"]> = "synced",
): ActiveListSyncCoordinator {
	return {
		getStatus: () => status,
		subscribe: jest.fn(() => ({ remove() {} })),
		requestSync: jest.fn<
			ReturnType<ActiveListSyncCoordinator["requestSync"]>,
			Parameters<ActiveListSyncCoordinator["requestSync"]>
		>(async () => ({ changed: false })),
	};
}

function syncCoordinatorWithPostSubscribeStatus(
	status: ReturnType<ActiveListSyncCoordinator["getStatus"]>,
): ActiveListSyncCoordinator {
	let currentStatus: ReturnType<ActiveListSyncCoordinator["getStatus"]> =
		"synced";

	return {
		getStatus: jest.fn(() => currentStatus),
		subscribe: jest.fn(() => {
			currentStatus = status;
			return { remove() {} };
		}),
		requestSync: jest.fn<
			ReturnType<ActiveListSyncCoordinator["requestSync"]>,
			Parameters<ActiveListSyncCoordinator["requestSync"]>
		>(async () => ({ changed: false })),
	};
}

function controllableSyncCoordinator(
	initialStatus: ReturnType<ActiveListSyncCoordinator["getStatus"]>,
): TestSyncCoordinator {
	let status = initialStatus;
	const listeners = new Set<
		(status: ReturnType<ActiveListSyncCoordinator["getStatus"]>) => void
	>();

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
		requestSync: jest.fn<
			ReturnType<ActiveListSyncCoordinator["requestSync"]>,
			Parameters<ActiveListSyncCoordinator["requestSync"]>
		>(async () => ({ changed: false })),
		emit(nextStatus) {
			status = nextStatus;
			for (const listener of listeners) {
				listener(status);
			}
		},
	};
}

function memoryListActions(
	initialState: ActiveListState,
	overrides: Partial<ActiveListMemoryActions> = {},
): ActiveListMemoryActions {
	return {
		...createActiveListMemoryActions(initialState, {
			itemIdPrefix: "test-item",
			checkedByMemberName: "Avery Chen",
		}),
		...overrides,
	};
}

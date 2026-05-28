import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";

import {
	ActiveList,
	type ActiveListInitialState,
	type ActiveListManagedSyncCoordinator,
	type ActiveListSyncCoordinator,
} from "@/components/active-list";

const mockLoggerError = jest.fn();
const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: mockLoggerError,
	with: jest.fn(),
};

jest.mock("@/lib/logger", () => ({
	useLogger: () => mockLogger,
}));

beforeEach(() => {
	mockLoggerError.mockReset();
});

const emptyList: ActiveListInitialState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

type MemoryListActions = {
	syncAuthorized: boolean;
	load: () => Promise<ActiveListInitialState>;
	addItem: (name: string) => Promise<ActiveListInitialState["items"][number]>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	pull: () => Promise<{ changed: boolean }>;
	sync: () => Promise<{ changed: boolean }>;
	close: () => Promise<void>;
};

type TestSyncCoordinator = Omit<
	ActiveListManagedSyncCoordinator,
	"requestSync"
> & {
	requestSync: jest.MockedFunction<ActiveListSyncCoordinator["requestSync"]>;
	emit: (status: ReturnType<ActiveListSyncCoordinator["getStatus"]>) => void;
};

describe("ActiveList", () => {
	it("adds and checks an Item for the current Member", async () => {
		renderActiveList(emptyList);

		expect(screen.getByText("Avery")).toBeTruthy();
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("No Items yet")).toBeTruthy();
		expect(screen.getByText("This List is empty.")).toBeTruthy();

		const input = screen.getByPlaceholderText("Add an Item");
		fireEvent.changeText(input, " Milk ");
		await act(async () => {
			fireEvent.press(screen.getByText("Add"));
		});

		await waitFor(() => {
			expect(
				screen.getByRole("checkbox", { name: "Milk" }).props.accessibilityState,
			).toEqual({
				checked: false,
			});
		});
		expect(screen.getByText("0 of 1 Items checked")).toBeTruthy();
		expect(screen.queryByText("This List is empty.")).toBeNull();
		expect(input.props.value).toBe("");

		await act(async () => {
			fireEvent.press(screen.getByRole("checkbox", { name: "Milk" }));
		});

		await waitFor(() => {
			expect(
				screen.getByRole("checkbox", { name: "Milk" }).props.accessibilityState,
			).toEqual({
				checked: true,
			});
		});
		expect(screen.getByText("1 of 1 Items checked")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
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

		renderActiveList(emptyList, memoryListActions(emptyList), coordinator);

		fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Milk");
		await act(async () => {
			fireEvent.press(screen.getByText("Add"));
		});

		await waitFor(() => expect(screen.getByText("Pending sync")).toBeTruthy());

		await act(async () => {
			syncAfterWrite.reject(new TypeError("Network request failed"));
		});

		await waitFor(() =>
			expect(screen.getByText("Offline - changes saved locally")).toBeTruthy(),
		);
		expect(screen.getByRole("checkbox", { name: "Milk" })).toBeTruthy();
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it("shows offline sync state when sync is not authorized", () => {
		renderActiveList(
			emptyList,
			memoryListActions(emptyList, { syncAuthorized: false }),
			passiveSyncCoordinator("offline"),
		);

		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
	});

	it("requests local-write sync after adding an Item", async () => {
		const coordinator = controllableSyncCoordinator("synced");
		const sync = jest.fn(async () => ({ changed: false }));
		const actions = memoryListActions(emptyList, { sync });

		renderActiveList(emptyList, actions, coordinator);

		fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Milk");
		await act(async () => {
			fireEvent.press(screen.getByText("Add"));
		});

		await waitFor(() =>
			expect(coordinator.requestSync).toHaveBeenCalledWith({
				reason: "localWrite",
			}),
		);
		expect(sync).not.toHaveBeenCalled();
	});

	it("requests manual sync before refreshing the List view", async () => {
		let state = emptyList;
		const coordinator = controllableSyncCoordinator("synced");
		const actions = memoryListActions(emptyList, {
			async load() {
				return state;
			},
		});
		const load = jest.spyOn(actions, "load");

		coordinator.requestSync.mockImplementationOnce(async () => {
			coordinator.emit("pending");
			state = {
				...state,
				items: [
					...state.items,
					{
						id: "test-item-remote",
						name: "Remote Apples",
						checked: false,
						checkedByMemberName: null,
					},
				],
			};
			coordinator.emit("synced");
			return { changed: true };
		});

		renderActiveList(emptyList, actions, coordinator);

		await act(async () => {
			fireEvent.press(screen.getByText("Refresh"));
		});

		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
		expect(await screen.findByText("Remote Apples")).toBeTruthy();
		expect(coordinator.requestSync).toHaveBeenCalledWith({
			reason: "manualRefresh",
		});
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("reloads visible List rows after coordinator-owned sync completes", async () => {
		let state = emptyList;
		const coordinator = controllableSyncCoordinator("synced");
		const load = jest.fn(async () => state);
		const actions = memoryListActions(emptyList, { load });

		renderActiveList(emptyList, actions, coordinator);
		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());

		state = {
			...emptyList,
			items: [
				{
					id: "test-item-remote",
					name: "Remote Apples",
					checked: false,
					checkedByMemberName: null,
				},
			],
		};

		await act(async () => {
			coordinator.emit("pending");
			coordinator.emit("synced");
			await Promise.resolve();
		});

		expect(await screen.findByText("Remote Apples")).toBeTruthy();
	});

	it("reports manual refresh failure when the visible List cannot reload", async () => {
		const refreshSync = deferred<{ changed: boolean }>();
		const load = jest
			.fn<Promise<ActiveListInitialState>, []>()
			.mockRejectedValueOnce(new Error("load failed"));
		const actions = memoryListActions(emptyList, {
			load,
		});
		const coordinator = controllableSyncCoordinator("synced");
		coordinator.requestSync.mockImplementationOnce(async () => {
			coordinator.emit("pending");
			await refreshSync.promise;
			coordinator.emit("synced");
			return { changed: true };
		});

		renderActiveList(emptyList, actions, coordinator);
		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());

		await act(async () => {
			fireEvent.press(screen.getByText("Refresh"));
		});
		expect(screen.getByText("Refreshing")).toBeTruthy();

		await act(async () => {
			refreshSync.resolve({ changed: true });
		});

		await waitFor(() =>
			expect(
				screen.getByText("Unable to refresh this List. Please try again."),
			).toBeTruthy(),
		);
		expect(screen.getByText("Refresh")).toBeTruthy();
		expect(mockLoggerError).toHaveBeenCalledWith("active list refresh failed", {
			error: expect.any(Error),
		});
	});

	it("reports manual refresh failure when sync fails unexpectedly", async () => {
		const syncError = new Error("remote unavailable");
		const coordinator = controllableSyncCoordinator("synced");
		coordinator.requestSync.mockImplementationOnce(async () => {
			coordinator.emit("pending");
			coordinator.emit("failed");
			throw syncError;
		});

		renderActiveList(emptyList, memoryListActions(emptyList), coordinator);
		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());

		await act(async () => {
			fireEvent.press(screen.getByText("Refresh"));
		});

		await waitFor(() =>
			expect(
				screen.getByText("Unable to refresh this List. Please try again."),
			).toBeTruthy(),
		);
		expect(
			screen.getByText("Sync failed - changes saved locally"),
		).toBeTruthy();
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it("does not reload List data when a sync completes after unmount", async () => {
		const syncAfterWrite = deferred<{ changed: boolean }>();
		const load = jest.fn(async () => emptyList);
		const coordinator = controllableSyncCoordinator("synced");
		coordinator.requestSync.mockImplementationOnce(async () => {
			await syncAfterWrite.promise;
			return { changed: true };
		});
		const { unmount } = renderActiveList(
			emptyList,
			memoryListActions(emptyList, { load }),
			coordinator,
		);

		fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Milk");
		await act(async () => {
			fireEvent.press(screen.getByText("Add"));
		});
		await waitFor(() =>
			expect(coordinator.requestSync).toHaveBeenCalledTimes(1),
		);

		unmount();
		await act(async () => {
			syncAfterWrite.resolve({ changed: true });
			await Promise.resolve();
		});

		expect(load).not.toHaveBeenCalled();
	});

	it("stops a managed sync coordinator on unmount", async () => {
		const stopSync = deferred<void>();
		const coordinator = passiveSyncCoordinator();
		jest
			.mocked(coordinator.stop)
			.mockImplementationOnce(() => stopSync.promise);

		const { unmount } = renderActiveList(
			emptyList,
			memoryListActions(emptyList),
			coordinator,
		);

		unmount();

		await waitFor(() => expect(coordinator.stop).toHaveBeenCalledTimes(1));
		stopSync.resolve(undefined);
	});
});

function renderActiveList(
	initialState: ActiveListInitialState,
	actions = memoryListActions(initialState),
	syncCoordinator = passiveSyncCoordinator(),
) {
	return render(
		<ActiveList.Provider
			initialState={initialState}
			currentMemberName="Avery Chen"
			onLoadList={actions.load}
			onAddItem={actions.addItem}
			onSetItemChecked={actions.setItemChecked}
			syncCoordinator={syncCoordinator}
		>
			<ActiveList.Screen>
				<ActiveList.Header />
				<ActiveList.Items />
				<ActiveList.AddItemForm />
			</ActiveList.Screen>
		</ActiveList.Provider>,
	);
}

function passiveSyncCoordinator(
	status: ReturnType<ActiveListSyncCoordinator["getStatus"]> = "synced",
): ActiveListManagedSyncCoordinator {
	return {
		getStatus: () => status,
		subscribe: jest.fn(() => ({ remove() {} })),
		start: jest.fn(),
		stop: jest.fn(async () => undefined),
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
		start: jest.fn(),
		stop: jest.fn(async () => undefined),
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
	initialState: ActiveListInitialState,
	overrides: Partial<MemoryListActions> = {},
): MemoryListActions {
	let state = initialState;
	let nextItem = initialState.items.length + 1;

	return {
		syncAuthorized: true,
		async load() {
			return state;
		},
		async addItem(name) {
			const item = {
				id: `test-item-${nextItem}`,
				name,
				checked: false,
				checkedByMemberName: null,
			};
			nextItem += 1;
			state = { ...state, items: [...state.items, item] };
			return item;
		},
		async setItemChecked(itemId, checked) {
			state = {
				...state,
				items: state.items.map((item) =>
					item.id === itemId
						? {
								...item,
								checked,
								checkedByMemberName: checked ? "Avery Chen" : null,
							}
						: item,
				),
			};
		},
		async pull() {
			state = {
				...state,
				items: [
					...state.items,
					{
						id: "test-item-remote",
						name: "Remote Apples",
						checked: false,
						checkedByMemberName: null,
					},
				],
			};
			return { changed: true };
		},
		async sync() {
			return { changed: false };
		},
		async close() {},
		...overrides,
	};
}

function deferred<T>() {
	let resolve: ((value: T) => void) | undefined;
	let reject: ((error: Error) => void) | undefined;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	if (!resolve || !reject) {
		throw new Error("Unable to create deferred promise");
	}

	return { promise, resolve, reject };
}

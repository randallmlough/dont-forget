import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";

import {
	ActiveList,
	type ActiveListDataSource,
	type ActiveListInitialState,
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
		const sync = jest
			.fn<
				Promise<{ changed: boolean }>,
				Parameters<ActiveListDataSource["sync"]>
			>()
			.mockResolvedValueOnce({ changed: false })
			.mockReturnValueOnce(syncAfterWrite.promise);
		renderActiveList(emptyList, memoryDataSource(emptyList, { sync }));
		await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));

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

	it("retries offline sync while the List remains open", async () => {
		jest.useFakeTimers();
		const sync = jest
			.fn<
				Promise<{ changed: boolean }>,
				Parameters<ActiveListDataSource["sync"]>
			>()
			.mockResolvedValueOnce({ changed: false })
			.mockRejectedValueOnce(new TypeError("Network request failed"))
			.mockResolvedValue({ changed: false });

		try {
			renderActiveList(emptyList, memoryDataSource(emptyList, { sync }));
			await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));

			fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Milk");
			await act(async () => {
				fireEvent.press(screen.getByText("Add"));
			});
			await waitFor(() =>
				expect(
					screen.getByText("Offline - changes saved locally"),
				).toBeTruthy(),
			);

			await act(async () => {
				jest.advanceTimersByTime(30_000);
				await Promise.resolve();
			});

			await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
			expect(sync).toHaveBeenCalledTimes(3);
			expect(sync).toHaveBeenLastCalledWith({ mode: "pushLocalOnly" });
			expect(mockLoggerError).not.toHaveBeenCalled();
		} finally {
			jest.useRealTimers();
		}
	});

	it("does not retry offline sync once per second", async () => {
		jest.useFakeTimers();
		const sync = jest
			.fn<
				Promise<{ changed: boolean }>,
				Parameters<ActiveListDataSource["sync"]>
			>()
			.mockResolvedValueOnce({ changed: false })
			.mockRejectedValue(new TypeError("Network request failed"));

		try {
			renderActiveList(emptyList, memoryDataSource(emptyList, { sync }));
			await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));

			fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Milk");
			await act(async () => {
				fireEvent.press(screen.getByText("Add"));
			});
			await waitFor(() =>
				expect(
					screen.getByText("Offline - changes saved locally"),
				).toBeTruthy(),
			);
			expect(sync).toHaveBeenCalledTimes(2);

			await act(async () => {
				jest.advanceTimersByTime(1000);
				await Promise.resolve();
			});

			expect(sync).toHaveBeenCalledTimes(2);
		} finally {
			jest.useRealTimers();
		}
	});

	it("pushes local-only sync when an authorized data source opens", async () => {
		const sync = jest.fn(async () => ({ changed: false }));

		renderActiveList(emptyList, memoryDataSource(emptyList, { sync }));

		await waitFor(() =>
			expect(sync).toHaveBeenCalledWith({ mode: "pushLocalOnly" }),
		);
		expect(screen.getByText("Synced")).toBeTruthy();
	});

	it("shows offline sync state when sync is not authorized", () => {
		renderActiveList(
			emptyList,
			memoryDataSource(emptyList, { syncAuthorized: false }),
		);

		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
	});

	it("pushes local changes before refreshing the List view", async () => {
		let state = emptyList;
		const sync = jest.fn(async () => ({ changed: false }));
		const dataSource = memoryDataSource(emptyList, {
			async load() {
				return state;
			},
			sync,
		});
		const pull = jest.spyOn(dataSource, "pull");

		renderActiveList(emptyList, dataSource);
		await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
		sync.mockImplementationOnce(async () => {
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
		});
		sync.mockClear();

		await act(async () => {
			fireEvent.press(screen.getByText("Refresh"));
		});

		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
		expect(await screen.findByText("Remote Apples")).toBeTruthy();
		expect(sync).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledWith(undefined);
		expect(pull).not.toHaveBeenCalled();
	});
});

function renderActiveList(
	initialState: ActiveListInitialState,
	dataSource = memoryDataSource(initialState),
) {
	return render(
		<ActiveList.Provider
			initialState={initialState}
			currentMemberName="Avery Chen"
			dataSource={dataSource}
		>
			<ActiveList.Screen>
				<ActiveList.Header />
				<ActiveList.Items />
				<ActiveList.AddItemForm />
			</ActiveList.Screen>
		</ActiveList.Provider>,
	);
}

function memoryDataSource(
	initialState: ActiveListInitialState,
	overrides: Partial<ActiveListDataSource> = {},
): ActiveListDataSource {
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

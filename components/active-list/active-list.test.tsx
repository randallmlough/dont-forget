import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";

import {
	ActiveList,
	type ActiveListDataAdapter,
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
		fireEvent.press(screen.getByText("Add"));

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

		fireEvent.press(screen.getByRole("checkbox", { name: "Milk" }));

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
});

function renderActiveList(initialState: ActiveListInitialState) {
	return render(
		<ActiveList.Provider
			initialState={initialState}
			currentMemberName="Avery Chen"
			adapter={memoryAdapter(initialState)}
		>
			<ActiveList.Screen>
				<ActiveList.Header />
				<ActiveList.Items />
				<ActiveList.AddItemForm />
			</ActiveList.Screen>
		</ActiveList.Provider>,
	);
}

function memoryAdapter(
	initialState: ActiveListInitialState,
): ActiveListDataAdapter {
	let state = initialState;
	let nextItem = initialState.items.length + 1;

	return {
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
		async close() {},
	};
}

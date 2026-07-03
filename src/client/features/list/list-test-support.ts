import type {
	ActiveListState,
	AddActiveListItemInput,
} from "./list-view-types";

export const emptyActiveListState: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

export const populatedActiveListState: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [
		{
			id: "item-1",
			name: "Milk",
			quantity: null,
			notes: null,
			checked: false,
			checkedByMemberName: null,
		},
		{
			id: "item-2",
			name: "Apples",
			quantity: "1 bag",
			notes: null,
			checked: true,
			checkedByMemberName: "Avery Chen",
		},
		{
			id: "item-3",
			name: "Paper towels",
			quantity: null,
			notes: "Recycled if available",
			checked: false,
			checkedByMemberName: null,
		},
	],
};

export const largeActiveListState: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: Array.from({ length: 24 }, (_, index) => ({
		id: `large-item-${index + 1}`,
		name:
			index === 0
				? "Extra long Item name that should stay readable in the List row"
				: `Pantry staple ${index + 1}`,
		quantity: index % 3 === 0 ? `${index + 1} ct` : null,
		notes: index % 4 === 0 ? "Check the bottom shelf before buying" : null,
		checked: index % 2 === 0,
		checkedByMemberName: index % 2 === 0 ? "Avery Chen" : null,
	})),
};

export type ActiveListMemoryActions = {
	load: () => Promise<ActiveListState>;
	addItem: (input: AddActiveListItemInput) => Promise<void>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

type ActiveListMemoryActionsOptions = {
	itemIdPrefix?: string;
	checkedByMemberName?: string;
};

export function createActiveListMemoryActions(
	initialState: ActiveListState,
	options: ActiveListMemoryActionsOptions = {},
): ActiveListMemoryActions {
	const itemIdPrefix = options.itemIdPrefix ?? "memory-item";
	const checkedByMemberName = options.checkedByMemberName ?? "Avery Chen";
	let state = initialState;
	let nextItem = initialState.items.length + 1;

	return {
		async load() {
			return state;
		},
		async addItem(input) {
			const item = {
				id: `${itemIdPrefix}-${nextItem}`,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
				checked: false,
				checkedByMemberName: null,
			};
			nextItem += 1;
			state = { ...state, items: [...state.items, item] };
		},
		async setItemChecked(itemId, checked) {
			state = {
				...state,
				items: state.items.map((item) =>
					item.id === itemId
						? {
								...item,
								checked,
								checkedByMemberName: checked ? checkedByMemberName : null,
							}
						: item,
				),
			};
		},
	};
}

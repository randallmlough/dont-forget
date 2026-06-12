import type {
	ActiveListState,
	ActiveListSyncCoordinator,
	AddActiveListItemInput,
} from "./types";

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

export function createPassiveActiveListSyncCoordinator(
	status: ReturnType<ActiveListSyncCoordinator["getStatus"]> = "synced",
): ActiveListSyncCoordinator {
	return {
		getStatus: () => status,
		subscribe: () => ({ remove() {} }),
		async requestSync() {
			return { changed: false };
		},
	};
}

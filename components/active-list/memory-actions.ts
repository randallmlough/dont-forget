import type {
	ActiveListInitialState,
	ActiveListSyncCoordinator,
	AddActiveListItemInput,
} from "./types";

export type ActiveListMemoryActions = {
	load: () => Promise<ActiveListInitialState>;
	addItem: (
		input: AddActiveListItemInput,
	) => Promise<ActiveListInitialState["items"][number]>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
};

type ActiveListMemoryActionsOptions = {
	itemIdPrefix?: string;
	checkedByMemberName?: string;
};

export function createActiveListMemoryActions(
	initialState: ActiveListInitialState,
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

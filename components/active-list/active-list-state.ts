import type { ActiveListItem, ActiveListState } from "@/components/active-list";

export type ActiveListModel = {
	list: ActiveListState;
	errorMessage: string | null;
	isRefreshing: boolean;
};

export type ActiveListTransition =
	| { type: "listLoaded"; list: ActiveListState }
	| { type: "refreshRequested" }
	| { type: "refreshFailed" }
	| { type: "itemAddedOptimistically"; item: ActiveListItem }
	| { type: "itemAddPersisted"; pendingItemId: string; item: ActiveListItem }
	| { type: "itemAddFailed" }
	| {
			type: "itemToggledOptimistically";
			itemId: string;
			checked: boolean;
			checkedByMemberName: string | null;
	  }
	| { type: "itemTogglePersisted" }
	| { type: "itemToggleFailed" };

export function initialActiveListModel(
	initialList: ActiveListState,
): ActiveListModel {
	return {
		list: initialList,
		errorMessage: null,
		isRefreshing: false,
	};
}

export function activeListReducer(
	model: ActiveListModel,
	transition: ActiveListTransition,
): ActiveListModel {
	switch (transition.type) {
		case "listLoaded":
			return { ...model, list: transition.list, isRefreshing: false };
		case "refreshRequested":
			return { ...model, errorMessage: null, isRefreshing: true };
		case "refreshFailed":
			return {
				...model,
				errorMessage: "Unable to refresh this List. Please try again.",
				isRefreshing: false,
			};
		case "itemAddedOptimistically":
			return {
				...model,
				list: { ...model.list, items: [...model.list.items, transition.item] },
			};
		case "itemAddPersisted":
			return {
				...model,
				errorMessage: null,
				list: {
					...model.list,
					items: model.list.items.map((item) =>
						item.id === transition.pendingItemId ? transition.item : item,
					),
				},
			};
		case "itemAddFailed":
			return {
				...model,
				errorMessage: "Unable to save that Item. The List was refreshed.",
			};
		case "itemToggledOptimistically":
			return {
				...model,
				list: {
					...model.list,
					items: model.list.items.map((item) => {
						if (item.id !== transition.itemId) return item;
						return {
							...item,
							checked: transition.checked,
							checkedByMemberName: transition.checkedByMemberName,
						};
					}),
				},
			};
		case "itemTogglePersisted":
			return { ...model, errorMessage: null };
		case "itemToggleFailed":
			return {
				...model,
				errorMessage: "Unable to save that change. The List was refreshed.",
			};
	}
}

import type { ActiveListState } from "@/components/active-list";
import {
	activeListReducer,
	initialActiveListModel,
} from "@/components/active-list/active-list-state";

describe("activeListReducer", () => {
	it("tracks refresh request, success, and failure", () => {
		const model = initialActiveListModel(listFixture(), "synced");
		const refreshing = activeListReducer(model, { type: "refreshRequested" });

		expect(refreshing).toMatchObject({
			errorMessage: null,
			isRefreshing: true,
		});

		const refreshedList = listFixture({ listName: "Warehouse" });
		expect(
			activeListReducer(refreshing, {
				type: "listLoaded",
				list: refreshedList,
			}),
		).toMatchObject({
			list: refreshedList,
			isRefreshing: false,
		});
		expect(
			activeListReducer(refreshing, { type: "refreshFailed" }),
		).toMatchObject({
			list: model.list,
			errorMessage: "Unable to refresh this List. Please try again.",
			isRefreshing: false,
		});
	});

	it("adds an Item optimistically and replaces it after persistence", () => {
		const model = initialActiveListModel(listFixture(), "synced");
		const optimistic = activeListReducer(model, {
			type: "itemAddedOptimistically",
			item: {
				id: "pending-item-2",
				name: "Eggs",
				checked: false,
				checkedByMemberName: null,
			},
		});

		expect(optimistic.list.items).toHaveLength(2);
		expect(optimistic.list.items[1]).toMatchObject({ id: "pending-item-2" });

		const persisted = activeListReducer(optimistic, {
			type: "itemAddPersisted",
			pendingItemId: "pending-item-2",
			item: {
				id: "itm_eggs",
				name: "Eggs",
				checked: false,
				checkedByMemberName: null,
			},
		});

		expect(persisted.errorMessage).toBeNull();
		expect(persisted.list.items[1]).toMatchObject({ id: "itm_eggs" });
	});

	it("records add failure while preserving the visible List for refresh handoff", () => {
		const model = activeListReducer(
			initialActiveListModel(listFixture(), "synced"),
			{
				type: "itemAddedOptimistically",
				item: {
					id: "pending-item-2",
					name: "Eggs",
					checked: false,
					checkedByMemberName: null,
				},
			},
		);

		expect(activeListReducer(model, { type: "itemAddFailed" })).toMatchObject({
			list: model.list,
			errorMessage: "Unable to save that Item. The List was refreshed.",
		});
	});

	it("toggles an Item optimistically and clears errors after persistence", () => {
		const model = initialActiveListModel(listFixture(), "synced");
		const toggled = activeListReducer(model, {
			type: "itemToggledOptimistically",
			itemId: "itm_milk",
			checked: true,
			checkedByMemberName: "Avery Chen",
		});

		expect(toggled.list.items[0]).toMatchObject({
			checked: true,
			checkedByMemberName: "Avery Chen",
		});

		expect(
			activeListReducer(toggled, { type: "itemTogglePersisted" }),
		).toMatchObject({
			errorMessage: null,
		});
	});

	it("records toggle failure while preserving the visible List for refresh handoff", () => {
		const model = activeListReducer(
			initialActiveListModel(listFixture(), "synced"),
			{
				type: "itemToggledOptimistically",
				itemId: "itm_milk",
				checked: true,
				checkedByMemberName: "Avery Chen",
			},
		);

		expect(
			activeListReducer(model, { type: "itemToggleFailed" }),
		).toMatchObject({
			list: model.list,
			errorMessage: "Unable to save that change. The List was refreshed.",
		});
	});
});

function listFixture(
	overrides: Partial<ActiveListState> = {},
): ActiveListState {
	return {
		householdName: "Avery",
		listName: "Groceries",
		items: [
			{
				id: "itm_milk",
				name: "Milk",
				checked: false,
				checkedByMemberName: null,
			},
		],
		...overrides,
	};
}

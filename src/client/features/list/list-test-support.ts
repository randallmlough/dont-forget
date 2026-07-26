import type { AuthenticatedAppSession } from "@/client/session";
import type { ListSummary } from "./list-service";
import type {
	ActiveListItem,
	ActiveListState,
	AddActiveListItemInput,
} from "./list-view-types";
import type { ListPageActions, ListPageState } from "./use-list-page";

export const authenticatedAppSession: AuthenticatedAppSession = {
	user: {
		id: "usr_avery",
		email: "avery@example.com",
		displayName: "Avery Chen",
		firstName: "Avery",
		lastName: "Chen",
	},
	activeHousehold: { id: "hh_avery", name: "Avery" },
	households: [
		{
			id: "hh_avery",
			name: "Avery",
			role: "owner",
			isActive: true,
		},
	],
	activeMember: {
		id: "mbr_avery",
		userId: "usr_avery",
		role: "owner",
		displayName: "Avery Chen",
	},
	members: [
		{
			membershipId: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
	],
};

export const emptyActiveListState: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

export const groceriesListSummary: ListSummary = {
	id: "lst_groceries",
	householdId: "hh_avery",
	name: "Groceries",
	createdByUserId: "usr_avery",
	createdAt: 1,
	updatedAt: 1,
	archived: false,
	archivedAt: null,
	lastActivityAt: 1,
	uncheckedItemCount: 0,
	checkedItemCount: 0,
};

export const pantryListSummary: ListSummary = {
	...groceriesListSummary,
	id: "lst_pantry",
	name: "Pantry",
	createdAt: 2,
	updatedAt: 2,
	lastActivityAt: 2,
};

export const populatedActiveListState: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: uncheckedItemsFirst([
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
	]),
};

/**
 * The `useListPage` state a List page renders from once its Items have loaded:
 * an empty List named after the summary, with stubbed Item actions. Overrides
 * carry the facts a test is actually asserting on, such as the Items on the
 * page or the action it expects to be called.
 */
export function activeListPage(
	summary: ListSummary,
	overrides: {
		list?: Partial<ActiveListState>;
		actions?: Partial<ListPageActions>;
	} = {},
): Extract<ListPageState, { status: "active" }> {
	return {
		status: "active",
		listId: summary.id,
		list: {
			...emptyActiveListState,
			listName: summary.name,
			...overrides.list,
		},
		actions: {
			addItem: jest.fn(async () => undefined),
			setItemChecked: jest.fn(async () => undefined),
			...overrides.actions,
		},
	};
}

export const largeActiveListState: ActiveListState = {
	householdName: "Avery",
	listName: "Groceries",
	items: uncheckedItemsFirst(
		Array.from({ length: 24 }, (_, index) => {
			const checked = index < 6 || index % 2 === 0;
			return {
				id: `large-item-${index + 1}`,
				name:
					index === 0
						? "Extra long Item name that should stay readable in the List row"
						: `Pantry staple ${index + 1}`,
				quantity: index % 3 === 0 ? `${index + 1} ct` : null,
				notes: index % 4 === 0 ? "Check the bottom shelf before buying" : null,
				checked,
				checkedByMemberName: checked ? "Avery Chen" : null,
			};
		}),
	),
};

export function addFixtureItem(
	list: ActiveListState,
	input: AddActiveListItemInput,
): ActiveListState {
	return {
		...list,
		items: uncheckedItemsFirst([
			...list.items,
			{
				id: `story-item-${list.items.length + 1}`,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
				checked: false,
				checkedByMemberName: null,
			},
		]),
	};
}

export function setFixtureItemChecked(
	list: ActiveListState,
	itemId: string,
	checked: boolean,
): ActiveListState {
	return {
		...list,
		items: uncheckedItemsFirst(
			list.items.map((item) =>
				item.id === itemId
					? {
							...item,
							checked,
							checkedByMemberName: checked ? "Avery Chen" : null,
						}
					: item,
			),
		),
	};
}

function uncheckedItemsFirst(
	items: readonly ActiveListItem[],
): ActiveListItem[] {
	return [
		...items.filter((item) => !item.checked),
		...items.filter((item) => item.checked),
	];
}

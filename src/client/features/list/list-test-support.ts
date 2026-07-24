import type { AuthenticatedAppSession } from "@/client/session";
import type {
	ActiveListState,
	AddActiveListItemInput,
} from "./list-view-types";

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

export function addFixtureItem(
	list: ActiveListState,
	input: AddActiveListItemInput,
): ActiveListState {
	return {
		...list,
		items: [
			...list.items,
			{
				id: `story-item-${list.items.length + 1}`,
				name: input.name,
				quantity: input.quantity,
				notes: input.notes,
				checked: false,
				checkedByMemberName: null,
			},
		],
	};
}

export function setFixtureItemChecked(
	list: ActiveListState,
	itemId: string,
	checked: boolean,
): ActiveListState {
	return {
		...list,
		items: list.items.map((item) =>
			item.id === itemId
				? {
						...item,
						checked,
						checkedByMemberName: checked ? "Avery Chen" : null,
					}
				: item,
		),
	};
}

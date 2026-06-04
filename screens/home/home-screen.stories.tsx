import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type {
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeScreenView } from "@/screens/home/home-screen";

const emptyHomeList: ActiveListInitialState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

const populatedHomeList: ActiveListInitialState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [
		{
			id: "item-1",
			name: "Coffee",
			quantity: null,
			note: null,
			checked: false,
			checkedByMemberName: null,
		},
		{
			id: "item-2",
			name: "Eggs",
			quantity: "1 dozen",
			note: null,
			checked: true,
			checkedByMemberName: "Avery Chen",
		},
		{
			id: "item-3",
			name: "Spinach",
			quantity: null,
			note: "Baby spinach",
			checked: false,
			checkedByMemberName: null,
		},
	],
};

const meta = {
	title: "Home/HomeScreen",
	component: HomeScreenView,
	parameters: {
		noSafeArea: true,
	},
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta<typeof HomeScreenView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyList: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(emptyHomeList),
		onSignOut: noop,
	},
};

export const WithItems: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(populatedHomeList),
		onSignOut: noop,
	},
};

export const Loading: Story = {
	args: {
		state: { status: "loading" },
		session: null,
		onSignOut: noop,
	},
};

export const AuthenticatedAppSessionError: Story = {
	args: {
		state: {
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		},
		session: null,
		onRetry: noop,
		onSignOut: noop,
	},
};

function noop() {}

function readySession(
	initialList: ActiveListInitialState,
): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: { id: "hh_story", name: initialList.householdName },
		households: [
			{
				id: "hh_story",
				name: initialList.householdName,
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
				role: "owner" as const,
				displayName: "Avery Chen",
			},
		],
		resourceKey: `story:${initialList.householdName}:${initialList.listName}`,
		services: {
			...storyServices(initialList),
			sync: storySyncCoordinator(),
		},
	};
}

function storyServices(initialList: ActiveListInitialState): {
	lists: ListService;
	items: ItemService;
} {
	let state = initialList;
	let nextItem = initialList.items.length + 1;

	return {
		lists: {
			async getList() {
				return {
					id: "lst_default_groceries",
					householdId: "hh_story",
					name: state.listName,
					createdByUserId: "usr_avery",
					createdAt: 1,
					updatedAt: 1,
				};
			},
		},
		items: {
			async listItems() {
				return state.items.map((item, position) => ({
					id: item.id,
					householdId: "hh_story",
					listId: "lst_default_groceries",
					name: item.name,
					quantity: item.quantity,
					notes: item.note,
					checked: item.checked,
					checkedByUserId: item.checked ? "usr_avery" : null,
					position,
					createdByUserId: "usr_avery",
					createdAt: 1,
					updatedAt: 1,
				}));
			},
			async addItem({ name, quantity, notes }) {
				const item = {
					id: `story-item-${nextItem}`,
					householdId: "hh_story",
					listId: "lst_default_groceries",
					name,
					quantity: quantity?.trim() || null,
					notes: notes?.trim() || null,
					checked: false,
					checkedByUserId: null,
					position: nextItem,
					createdByUserId: "usr_avery",
					createdAt: 1,
					updatedAt: 1,
				};
				nextItem += 1;
				state = {
					...state,
					items: [
						...state.items,
						{
							...item,
							note: item.notes,
							checkedByMemberName: null,
						},
					],
				};
				return item;
			},
			async setItemChecked({ itemId, checked }) {
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
		},
	};
}

function storySyncCoordinator(): ActiveListSyncCoordinator {
	return {
		getStatus: () => "synced",
		subscribe: () => ({ remove() {} }),
		async requestSync() {
			return { changed: false };
		},
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type {
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
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
		{ id: "item-1", name: "Coffee", checked: false, checkedByMemberName: null },
		{
			id: "item-2",
			name: "Eggs",
			checked: true,
			checkedByMemberName: "Avery Chen",
		},
		{
			id: "item-3",
			name: "Spinach",
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
		currentMemberName: "Avery Chen",
		content: readyContent(emptyHomeList),
		onSignOut: noop,
	},
};

export const WithItems: Story = {
	args: {
		currentMemberName: "Avery Chen",
		content: readyContent(populatedHomeList),
		onSignOut: noop,
	},
};

export const Loading: Story = {
	args: {
		currentMemberName: "Avery Chen",
		content: { status: "loading" },
		onSignOut: noop,
	},
};

export const HouseholdSessionError: Story = {
	args: {
		currentMemberName: "Avery Chen",
		content: {
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		},
		onRetry: noop,
		onSignOut: noop,
	},
};

function noop() {}

function readyContent(initialList: ActiveListInitialState) {
	return {
		status: "ready" as const,
		activeMemberName: "Avery Chen",
		household: { id: "hh_story", name: initialList.householdName },
		activeMember: { userId: "usr_avery", displayName: "Avery Chen" },
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner" as const,
				displayName: "Avery Chen",
			},
		],
		resourceKey: `story:${initialList.householdName}:${initialList.listName}`,
		...storyServices(initialList),
		syncCoordinator: storySyncCoordinator(),
	};
}

function storyServices(initialList: ActiveListInitialState): {
	listService: ListService;
	itemService: ItemService;
} {
	let state = initialList;
	let nextItem = initialList.items.length + 1;

	return {
		listService: {
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
		itemService: {
			async listItems() {
				return state.items.map((item, position) => ({
					id: item.id,
					householdId: "hh_story",
					listId: "lst_default_groceries",
					name: item.name,
					checked: item.checked,
					checkedByUserId: item.checked ? "usr_avery" : null,
					position,
					createdByUserId: "usr_avery",
					createdAt: 1,
					updatedAt: 1,
				}));
			},
			async addItem({ name }) {
				const item = {
					id: `story-item-${nextItem}`,
					householdId: "hh_story",
					listId: "lst_default_groceries",
					name,
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
					items: [...state.items, { ...item, checkedByMemberName: null }],
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
		start() {},
		async stop() {},
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

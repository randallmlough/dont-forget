import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type {
	ActiveListItem,
	ActiveListState,
	ActiveListSyncStatusSource,
} from "@/client/features/list/active-list";
import {
	createActiveListMemoryActions,
	emptyActiveListState,
	populatedActiveListState,
} from "@/client/features/list/active-list/test-support";
import type { Item, ItemService } from "@/client/features/list/item-service";
import type { ListService } from "@/client/features/list/list-service";
import type { AuthenticatedAppSession } from "@/client/session";
import { HomeScreenView } from "@/client/features/list/home-screen";

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
		session: readySession(emptyActiveListState),
		onOpenSettings: noop,
	},
};

export const WithItems: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(populatedActiveListState),
		onOpenSettings: noop,
	},
};

export const Loading: Story = {
	args: {
		state: { status: "loading" },
		session: null,
		onOpenSettings: noop,
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
		onOpenSettings: noop,
	},
};

function noop() {}

function readySession(initialList: ActiveListState): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
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
			changes: passiveChanges(),
			sync: storySyncStatus(),
		},
	};
}

function storyServices(initialList: ActiveListState): {
	lists: ListService;
	items: ItemService;
} {
	const actions = createActiveListMemoryActions(initialList, {
		itemIdPrefix: "story-item",
		checkedByMemberName: "Avery Chen",
	});

	return {
		lists: {
			async createList() {
				throw new Error("Story Lists must not be created");
			},
			async getList() {
				const state = await actions.load();
				return {
					status: "available",
					list: {
						id: "lst_default_groceries",
						householdId: "hh_story",
						name: state.listName,
						createdByUserId: "usr_avery",
						createdAt: 1,
						updatedAt: 1,
						archived: false,
						archivedAt: null,
					},
				};
			},
			async renameList() {
				throw new Error("Story Lists must not be renamed");
			},
			async deleteList() {
				throw new Error("Story Lists must not be deleted");
			},
			async listLists() {
				const state = await actions.load();
				return [
					{
						id: "lst_default_groceries",
						householdId: "hh_story",
						name: state.listName,
						createdByUserId: "usr_avery",
						createdAt: 1,
						updatedAt: 1,
						archived: false,
						archivedAt: null,
						lastActivityAt: 1,
						uncheckedItemCount: state.items.filter((item) => !item.checked)
							.length,
						checkedItemCount: state.items.filter((item) => item.checked).length,
					},
				];
			},
		},
		items: {
			async listItems() {
				const state = await actions.load();
				return state.items.map(activeListStoryItemToItem);
			},
			async addItem(input) {
				await actions.addItem({
					name: input.name,
					quantity: input.quantity,
					notes: input.notes,
				});
				const state = await actions.load();
				const item = state.items.at(-1);
				if (!item) {
					throw new Error("Story Item was not added");
				}
				return activeListStoryItemToItem(
					item,
					state.items.findIndex((stateItem) => stateItem.id === item.id),
				);
			},
			async setItemChecked({ itemId, checked }) {
				await actions.setItemChecked(itemId, checked);
			},
		},
	};
}

function activeListStoryItemToItem(
	item: ActiveListItem,
	position: number,
): Item {
	return {
		id: item.id,
		householdId: "hh_story",
		listId: "lst_default_groceries",
		name: item.name,
		quantity: item.quantity,
		notes: item.notes,
		checked: item.checked,
		checkedByUserId: item.checked ? "usr_avery" : null,
		position,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
	};
}

function storySyncStatus(): ActiveListSyncStatusSource {
	return {
		getStatus: () => "synced",
		subscribe: () => ({ remove() {} }),
	};
}

function passiveChanges(): AuthenticatedAppSession["services"]["changes"] {
	return {
		subscribe: () => ({ remove() {} }),
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

import type { Meta, StoryObj } from "@storybook/react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type {
	ActiveListInitialState,
	ActiveListItem,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import {
	createActiveListMemoryActions,
	emptyActiveListState,
	populatedActiveListState,
} from "@/components/active-list/test-support";
import { currentListSelectionStore } from "@/lib/local-storage/current-list-selection";
import type { Item, ItemService } from "@/lib/services/item";
import type { ListService, ListSummary } from "@/lib/services/list";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HomeScreenView } from "@/screens/home/home-screen";

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
		onSignOut: noop,
	},
};

export const WithItems: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(populatedActiveListState),
		onSignOut: noop,
	},
};

export const ZeroActive: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(emptyActiveListState, {
			activeLists: [],
			archivedLists: [],
		}),
		onSignOut: noop,
	},
};

export const ZeroActiveWithArchivedLists: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(emptyActiveListState, {
			activeLists: [],
			archivedLists: [
				storyListSummary({
					id: "lst_archived",
					name: "Archived Camping",
					archived: true,
					archivedAt: 1_700_000_000_000,
				}),
			],
		}),
		onSignOut: noop,
	},
};

export const ArchivedCurrentList: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: null,
		onSignOut: noop,
	},
	render: () => {
		const session = readySession(
			{
				...populatedActiveListState,
				listName: "Archived Camping",
			},
			{
				activeLists: [],
				archivedLists: [
					storyListSummary({
						id: "lst_archived",
						name: "Archived Camping",
						archived: true,
						archivedAt: 1_700_000_000_000,
					}),
				],
			},
		);
		return (
			<SelectionSeededHomeStory
				selectedListId="lst_archived"
				session={session}
			/>
		);
	},
};

export const DeletedCurrentList: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: null,
		onSignOut: noop,
	},
	render: () => {
		const session = readySession(emptyActiveListState, {
			activeLists: [storyListSummary({ id: "lst_weekend", name: "Weekend" })],
			deletedListIds: ["lst_deleted"],
		});
		return (
			<SelectionSeededHomeStory
				selectedListId="lst_deleted"
				session={session}
			/>
		);
	},
};

export const DuplicateListNames: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(populatedActiveListState, {
			activeLists: [
				storyListSummary({ id: "lst_groceries", name: "Costco" }),
				storyListSummary({ id: "lst_costco_duplicate", name: "Costco" }),
			],
		}),
		onSignOut: noop,
	},
};

export const LongCurrentListName: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession({
			...populatedActiveListState,
			listName:
				"Saturday warehouse run for the whole Household with backup pantry staples and birthday supplies",
		}),
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

type ReadySessionOptions = {
	activeLists?: ListSummary[];
	archivedLists?: ListSummary[];
	deletedListIds?: string[];
};

function readySession(
	initialList: ActiveListInitialState,
	options: ReadySessionOptions = {},
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
			...storyServices(initialList, options),
			sync: storySyncCoordinator(),
		},
	};
}

function storyServices(
	initialList: ActiveListInitialState,
	options: ReadySessionOptions = {},
): {
	lists: ListService;
	items: ItemService;
} {
	const actions = createActiveListMemoryActions(initialList, {
		itemIdPrefix: "story-item",
		checkedByMemberName: "Avery Chen",
	});
	let storyListName = initialList.listName;
	async function getStoryList() {
		const state = await actions.load();
		return storyListSummary({
			id: "lst_default_groceries",
			name: storyListName || state.listName,
			updatedAt: 1,
			lastActivityAt: 1,
			uncheckedItemCount: state.items.filter((item) => !item.checked).length,
			checkedItemCount: state.items.filter((item) => item.checked).length,
		});
	}

	async function activeLists() {
		return options.activeLists ?? [await getStoryList()];
	}

	async function archivedLists() {
		return options.archivedLists ?? [];
	}

	async function allLists() {
		return [...(await activeLists()), ...(await archivedLists())];
	}

	return {
		lists: {
			async archiveList(input) {
				if (input.listId !== (await getStoryList()).id) {
					return { status: "missing", listId: input.listId };
				}
				return { status: "unchanged", list: await getStoryList() };
			},
			async createList(input) {
				const name = input.name.trim();
				if (!name) {
					return {
						status: "invalid",
						error: { code: "empty-name", name },
					};
				}
				if (name.length > 80) {
					return {
						status: "invalid",
						error: { code: "name-too-long", name, maxLength: 80 },
					};
				}
				storyListName = name;
				return { status: "created", list: await getStoryList() };
			},
			async deleteList(input) {
				if (input.listId !== (await getStoryList()).id) {
					return { status: "missing", listId: input.listId };
				}
				return {
					status: "deleted",
					listId: input.listId,
					deletedAt: 1,
					updatedAt: 1,
				};
			},
			async getList(input) {
				if (options.deletedListIds?.includes(input.listId)) {
					return {
						status: "deleted",
						listId: input.listId,
						deletedAt: 1,
						updatedAt: 1,
					};
				}
				const list = (await allLists()).find(
					(entry) => entry.id === input.listId,
				);
				if (!list) {
					return { status: "missing", listId: input.listId };
				}
				return { status: "available", list };
			},
			async listLists(input) {
				if (input?.archive === "archived") {
					return archivedLists();
				}
				const lists = await activeLists();
				const searchText = input?.searchText?.trim().toLowerCase();
				if (searchText) {
					return lists.filter((list) =>
						list.name.toLowerCase().includes(searchText),
					);
				}
				return lists;
			},
			async listActiveLists() {
				return activeLists();
			},
			async renameList(input) {
				const name = input.name.trim();
				if (!name) {
					return {
						status: "invalid",
						error: { code: "empty-name", name },
					};
				}
				if (name.length > 80) {
					return {
						status: "invalid",
						error: { code: "name-too-long", name, maxLength: 80 },
					};
				}
				if (input.listId !== (await getStoryList()).id) {
					return { status: "missing", listId: input.listId };
				}
				if (name === storyListName) {
					return { status: "unchanged", list: await getStoryList() };
				}
				storyListName = name;
				return { status: "renamed", list: await getStoryList() };
			},
			async unarchiveList(input) {
				if (input.listId !== (await getStoryList()).id) {
					return { status: "missing", listId: input.listId };
				}
				return { status: "unchanged", list: await getStoryList() };
			},
		},
		items: {
			async listItems() {
				const state = await actions.load();
				return state.items.map(activeListStoryItemToItem);
			},
			async addItem(input) {
				const item = await actions.addItem({
					name: input.name,
					quantity: input.quantity,
					notes: input.notes,
				});
				const state = await actions.load();
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

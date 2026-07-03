import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { HomeCurrentListDeps } from "@/client/features/list/current-list";
import { HomeScreenView } from "@/client/features/list/home-screen";
import {
	emptyActiveListState,
	populatedActiveListState,
} from "@/client/features/list/list-test-support";
import type {
	ActiveListState,
	AddActiveListItemInput,
} from "@/client/features/list/list-view-types";
import type { AuthenticatedAppSession } from "@/client/session";

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
	render: () => <HomeStory initialList={emptyActiveListState} />,
};

export const WithItems: Story = {
	args: {
		state: { status: "ready", refreshing: false },
		session: readySession(populatedActiveListState),
		onOpenSettings: noop,
	},
	render: () => <HomeStory initialList={populatedActiveListState} />,
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

function HomeStory({ initialList }: { initialList: ActiveListState }) {
	const [list, setList] = useState(initialList);
	const currentListDeps: HomeCurrentListDeps = {
		currentList: {
			state: {
				status: "active",
				listId: "lst_story",
				list,
				actions: {
					addItem: async (input) => {
						setList((current) => addFixtureItem(current, input));
					},
					setItemChecked: async (itemId, checked) => {
						setList((current) =>
							setFixtureItemChecked(current, itemId, checked),
						);
					},
				},
			},
			retry: noop,
			reload: noop,
		},
		syncState: "synced",
	};

	return (
		<HomeScreenView
			state={{ status: "ready", refreshing: false }}
			session={readySession(list)}
			onOpenSettings={noop}
			currentListDeps={currentListDeps}
		/>
	);
}

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
	};
}

function addFixtureItem(
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

function setFixtureItemChecked(
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

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

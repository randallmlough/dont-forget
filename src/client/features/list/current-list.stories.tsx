import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AuthenticatedAppSession } from "@/client/session";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import {
	addFixtureItem,
	emptyActiveListState,
	populatedActiveListState,
	setFixtureItemChecked,
} from "./list-test-support";
import type { ActiveListState } from "./list-view-types";

// Render-only stories, matching list-parts.stories.tsx: CurrentList's required
// props are supplied per story rather than through args.
const meta = {
	title: "List/CurrentList",
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const EmptyList: Story = {
	render: () => <CurrentListStory initialList={emptyActiveListState} />,
};

export const WithItems: Story = {
	render: () => <CurrentListStory initialList={populatedActiveListState} />,
};

export const ZeroActive: Story = {
	render: () => (
		<CurrentList
			session={readySession(emptyActiveListState)}
			deps={{
				currentList: {
					state: { status: "zeroActive" },
					retry: noop,
					reload: noop,
				},
				syncState: "synced",
				listRows: { status: "ready", summaries: [] },
			}}
			onOpenLists={noop}
		/>
	),
};

function noop() {}

function CurrentListStory({ initialList }: { initialList: ActiveListState }) {
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
		listRows: { status: "ready", summaries: [] },
	};

	return (
		<CurrentList
			session={readySession(list)}
			deps={currentListDeps}
			onOpenLists={noop}
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

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

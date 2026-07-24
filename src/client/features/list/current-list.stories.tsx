import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import {
	addFixtureItem,
	authenticatedAppSession,
	emptyActiveListState,
	populatedActiveListState,
	setFixtureItemChecked,
} from "./list-test-support";
import type { ActiveListState } from "./list-view-types";

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
			session={authenticatedAppSession}
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
			session={authenticatedAppSession}
			deps={currentListDeps}
			onOpenLists={noop}
		/>
	);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

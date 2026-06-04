import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	ActiveList,
	type ActiveListInitialState,
} from "@/components/active-list";
import {
	createActiveListMemoryActions,
	createPassiveActiveListSyncCoordinator,
} from "./memory-actions";

const emptyList: ActiveListInitialState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

const populatedList: ActiveListInitialState = {
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

const meta = {
	title: "Active List",
	component: ActiveList.Screen,
} satisfies Meta<typeof ActiveList.Screen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
	render: () => <ActiveListStory initialState={emptyList} />,
};

export const WithItems: Story = {
	render: () => <ActiveListStory initialState={populatedList} />,
};

function ActiveListStory({
	initialState,
}: {
	initialState: ActiveListInitialState;
}) {
	const [actions] = useState(() =>
		createActiveListMemoryActions(initialState, {
			itemIdPrefix: "story-item",
			checkedByMemberName: "Avery Chen",
		}),
	);
	const [syncCoordinator] = useState(createPassiveActiveListSyncCoordinator);

	return (
		<View style={styles.canvas}>
			<ActiveList.Provider
				initialState={initialState}
				currentMemberName="Avery Chen"
				onLoadList={actions.load}
				onAddItem={actions.addItem}
				onSetItemChecked={actions.setItemChecked}
				syncCoordinator={syncCoordinator}
			>
				<ActiveList.Screen>
					<ActiveList.Header />
					<ActiveList.Items />
					<ActiveList.AddItemForm />
				</ActiveList.Screen>
			</ActiveList.Provider>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

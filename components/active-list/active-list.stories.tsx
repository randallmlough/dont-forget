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
	emptyActiveListState,
	populatedActiveListState,
} from "@/components/active-list/test-support";

const meta = {
	title: "Active List",
	component: ActiveList.Screen,
} satisfies Meta<typeof ActiveList.Screen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
	render: () => <ActiveListStory initialState={emptyActiveListState} />,
};

export const WithItems: Story = {
	render: () => <ActiveListStory initialState={populatedActiveListState} />,
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

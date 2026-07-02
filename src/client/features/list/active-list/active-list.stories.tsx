import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	ActiveList,
	type ActiveListState,
} from "@/client/features/list/active-list";
import {
	createActiveListMemoryActions,
	createPassiveActiveListSyncStatus,
	emptyActiveListState,
	populatedActiveListState,
} from "@/client/features/list/active-list/test-support";

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

function ActiveListStory({ initialState }: { initialState: ActiveListState }) {
	const [state, setState] = useState(initialState);
	const [actions] = useState(() =>
		createActiveListMemoryActions(initialState, {
			itemIdPrefix: "story-item",
			checkedByMemberName: "Avery Chen",
		}),
	);
	const [syncStatus] = useState(createPassiveActiveListSyncStatus);

	return (
		<View style={styles.canvas}>
			<ActiveList.Provider
				state={state}
				currentMemberName="Avery Chen"
				onAddItem={async (input) => {
					await actions.addItem(input);
					setState(await actions.load());
				}}
				onSetItemChecked={async (itemId, checked) => {
					await actions.setItemChecked(itemId, checked);
					setState(await actions.load());
				}}
				syncStatus={syncStatus}
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

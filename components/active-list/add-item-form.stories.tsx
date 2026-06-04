import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
	ActiveList,
	type ActiveListInitialState,
} from "@/components/active-list";
import {
	createActiveListMemoryActions,
	createPassiveActiveListSyncCoordinator,
} from "./__fixtures__/memory-actions";

const emptyList: ActiveListInitialState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};

const meta = {
	title: "Active List/Add Item Composer",
	component: ActiveList.AddItemForm,
} satisfies Meta<typeof ActiveList.AddItemForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => <AddItemComposerStory />,
};

function AddItemComposerStory() {
	const [actions] = useState(() =>
		createActiveListMemoryActions(emptyList, {
			itemIdPrefix: "story-item",
			checkedByMemberName: "Avery Chen",
		}),
	);
	const [syncCoordinator] = useState(createPassiveActiveListSyncCoordinator);

	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<View style={styles.canvas}>
				<ActiveList.Provider
					initialState={emptyList}
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
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

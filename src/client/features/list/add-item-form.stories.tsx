import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { AddItemForm } from "./add-item-form";
import {
	createActiveListMemoryActions,
	emptyActiveListState,
} from "./list-test-support";
import { useListActions } from "./use-list-actions";

const meta = {
	title: "List/Add Item Form",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => <AddItemFormStory />,
};

function AddItemFormStory() {
	const [state, setState] = useState(emptyActiveListState);
	const [memoryActions] = useState(() =>
		createActiveListMemoryActions(emptyActiveListState, {
			itemIdPrefix: "story-item",
			checkedByMemberName: "Avery Chen",
		}),
	);
	const actions = useListActions({
		items: state.items,
		onAddItem: async (input) => {
			await memoryActions.addItem(input);
			setState(await memoryActions.load());
		},
		onSetItemChecked: async (itemId, checked) => {
			await memoryActions.setItemChecked(itemId, checked);
			setState(await memoryActions.load());
		},
	});

	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<View style={styles.canvas}>
				<AddItemForm
					listName={state.listName}
					errorMessage={actions.errorMessage}
					onAddItem={actions.addItem}
				/>
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

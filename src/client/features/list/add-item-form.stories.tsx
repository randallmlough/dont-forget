import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { AddItemForm } from "./add-item-form";
import {
	addFixtureItem,
	emptyActiveListState,
	setFixtureItemChecked,
} from "./list-test-support";
import { useListActions } from "./use-list-actions";

const meta = {
	title: "Features/List/Add Item Form",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => <AddItemFormStory />,
};

function AddItemFormStory() {
	const [state, setState] = useState(emptyActiveListState);
	const actions = useListActions({
		items: state.items,
		onAddItem: async (input) => {
			setState((current) => addFixtureItem(current, input));
		},
		onSetItemChecked: async (itemId, checked) => {
			setState((current) => setFixtureItemChecked(current, itemId, checked));
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
					currentListId="lst_groceries"
					listOptions={[
						{ id: "lst_groceries", name: state.listName },
						{ id: "lst_costco", name: "Costco" },
					]}
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

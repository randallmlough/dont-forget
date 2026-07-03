import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AddItemForm } from "./add-item-form";
import { ItemRows } from "./item-rows";
import { ListHeader } from "./list-header";
import {
	createActiveListMemoryActions,
	emptyActiveListState,
	largeActiveListState,
	populatedActiveListState,
} from "./list-test-support";
import type { ActiveListState } from "./list-view-types";
import { useListActions } from "./use-list-actions";

const meta = {
	title: "List/List Parts",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
	render: () => <ListPartsStory initialState={emptyActiveListState} />,
};

export const WithItems: Story = {
	render: () => <ListPartsStory initialState={populatedActiveListState} />,
};

export const ManyItems: Story = {
	render: () => <ListPartsStory initialState={largeActiveListState} />,
};

function ListPartsStory({ initialState }: { initialState: ActiveListState }) {
	const [state, setState] = useState(initialState);
	const [memoryActions] = useState(() =>
		createActiveListMemoryActions(initialState, {
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
		<View style={styles.canvas}>
			<ListHeader
				state={state}
				meta={{
					currentMemberName: "Avery Chen",
					errorMessage: actions.errorMessage,
					syncState: "synced",
				}}
			/>
			<ItemRows items={state.items} onToggleItem={actions.toggleItem} />
			<AddItemForm
				listName={state.listName}
				errorMessage={actions.errorMessage}
				onAddItem={actions.addItem}
			/>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

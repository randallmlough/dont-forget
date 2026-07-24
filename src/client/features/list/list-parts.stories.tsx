import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AddItemForm } from "./add-item-form";
import { ItemRows } from "./item-rows";
import { ListOverview } from "./list-overview";
import {
	addFixtureItem,
	emptyActiveListState,
	largeActiveListState,
	populatedActiveListState,
	setFixtureItemChecked,
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
		<View style={styles.canvas}>
			<ItemRows
				items={state.items}
				listOverview={
					<ListOverview
						state={state}
						meta={{
							currentMemberName: "Avery Chen",
							errorMessage: actions.errorMessage,
							syncState: "synced",
						}}
					/>
				}
				onToggleItem={actions.toggleItem}
			/>
			<AddItemForm
				currentListId="lst_story"
				listOptions={[{ id: "lst_story", name: state.listName }]}
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

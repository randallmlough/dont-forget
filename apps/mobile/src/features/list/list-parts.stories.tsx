import type { UpdateListItemInput } from "@mobile/features/item/item-view-types";
import { useItemEditor } from "@mobile/features/item/use-item-editor";
import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ListItems } from "./list-items";
import { ListOverview } from "./list-overview";
import {
	addFixtureItem,
	emptyActiveListState,
	largeActiveListState,
	populatedActiveListState,
	setFixtureItemChecked,
} from "./list-test-support";
import type { ActiveListState } from "./list-view-types";

const meta = {
	title: "Features/List/List Parts",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
	render: () => <ListPartsStory initialState={emptyActiveListState} />,
};

export const WithItems: Story = {
	render: () => <ListPartsStory initialState={populatedActiveListState} />,
};

export const Creating: Story = {
	render: () => (
		<ListPartsStory
			creationRequestKey={1}
			initialState={populatedActiveListState}
		/>
	),
};

export const ManyItems: Story = {
	render: () => <ListPartsStory initialState={largeActiveListState} />,
};

function ListPartsStory({
	initialState,
	creationRequestKey = null,
}: {
	initialState: ActiveListState;
	creationRequestKey?: number | null;
}) {
	const [state, setState] = useState(initialState);
	const editor = useItemEditor({
		currentListId: "lst_story",
		items: state.items,
		listOptions: [
			{ id: "lst_story", name: state.listName },
			{ id: "lst_costco", name: "Costco" },
		],
		creationRequestKey,
		onAddItem: async (input) => {
			setState((current) => addFixtureItem(current, input));
		},
		onUpdateItem: async (input) => {
			setState((current) => updateFixtureItem(current, input));
		},
		onDeleteItem: async (input) => {
			setState((current) => ({
				...current,
				items: current.items.filter((item) => item.id !== input.itemId),
			}));
		},
		onSetItemChecked: async (itemId, checked) => {
			setState((current) => setFixtureItemChecked(current, itemId, checked));
		},
		onActiveChange: () => undefined,
	});

	return (
		<View style={styles.canvas}>
			<ListItems
				editor={editor}
				items={state.items}
				listOverview={
					<ListOverview
						state={state}
						meta={{
							currentMemberName: "Avery Chen",
							syncState: "synced",
						}}
					/>
				}
			/>
		</View>
	);
}

function updateFixtureItem(
	list: ActiveListState,
	input: UpdateListItemInput,
): ActiveListState {
	if (input.destinationListId !== input.sourceListId) {
		return {
			...list,
			items: list.items.filter((item) => item.id !== input.itemId),
		};
	}
	return {
		...list,
		items: list.items.map((item) =>
			item.id === input.itemId
				? {
						...item,
						name: input.name,
						quantity: input.quantity,
						notes: input.notes,
					}
				: item,
		),
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

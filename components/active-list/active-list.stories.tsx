import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	ActiveList,
	type ActiveListInitialState,
	type ActiveListSyncCoordinator,
	type AddActiveListItemInput,
} from "@/components/active-list";

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
			note: null,
			checked: false,
			checkedByMemberName: null,
		},
		{
			id: "item-2",
			name: "Apples",
			quantity: "1 bag",
			note: null,
			checked: true,
			checkedByMemberName: "Avery Chen",
		},
		{
			id: "item-3",
			name: "Paper towels",
			quantity: null,
			note: "Recycled if available",
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
	const [actions] = useState(() => storyActions(initialState));
	const [syncCoordinator] = useState(storySyncCoordinator);

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

function storySyncCoordinator(): ActiveListSyncCoordinator {
	return {
		getStatus: () => "synced",
		subscribe: () => ({ remove() {} }),
		async requestSync() {
			return { changed: false };
		},
	};
}

function storyActions(initialState: ActiveListInitialState): {
	load: () => Promise<ActiveListInitialState>;
	addItem: (
		input: AddActiveListItemInput,
	) => Promise<ActiveListInitialState["items"][number]>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
} {
	let state = initialState;
	let nextItem = initialState.items.length + 1;

	return {
		async load() {
			return state;
		},
		async addItem(input) {
			const item = {
				id: `story-item-${nextItem}`,
				name: input.name,
				quantity: input.quantity,
				note: input.note,
				checked: false,
				checkedByMemberName: null,
			};
			nextItem += 1;
			state = { ...state, items: [...state.items, item] };
			return item;
		},
		async setItemChecked(itemId, checked) {
			state = {
				...state,
				items: state.items.map((item) =>
					item.id === itemId
						? {
								...item,
								checked,
								checkedByMemberName: checked ? "Avery Chen" : null,
							}
						: item,
				),
			};
		},
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

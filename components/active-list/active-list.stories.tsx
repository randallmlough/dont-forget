import type { Meta, StoryObj } from "@storybook/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
	ActiveList,
	type ActiveListInitialState,
	type ActiveListManagedSyncCoordinator,
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
		{ id: "item-1", name: "Milk", checked: false, checkedByMemberName: null },
		{
			id: "item-2",
			name: "Apples",
			checked: true,
			checkedByMemberName: "Avery Chen",
		},
		{
			id: "item-3",
			name: "Paper towels",
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
	const actions = useMemo(() => storyActions(initialState), [initialState]);
	const syncCoordinator = useMemo(() => storySyncCoordinator(), []);

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

function storySyncCoordinator(): ActiveListManagedSyncCoordinator {
	return {
		getStatus: () => "synced",
		subscribe: () => ({ remove() {} }),
		start() {},
		async stop() {},
		async requestSync() {
			return { changed: false };
		},
	};
}

function storyActions(initialState: ActiveListInitialState): {
	syncAuthorized: boolean;
	load: () => Promise<ActiveListInitialState>;
	addItem: (name: string) => Promise<ActiveListInitialState["items"][number]>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
	pull: () => Promise<{ changed: boolean }>;
	sync: () => Promise<{ changed: boolean }>;
	close: () => Promise<void>;
} {
	let state = initialState;
	let nextItem = initialState.items.length + 1;

	return {
		syncAuthorized: true,
		async load() {
			return state;
		},
		async addItem(name) {
			const item = {
				id: `story-item-${nextItem}`,
				name,
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
		async pull() {
			return { changed: false };
		},
		async sync() {
			return { changed: false };
		},
		async close() {},
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

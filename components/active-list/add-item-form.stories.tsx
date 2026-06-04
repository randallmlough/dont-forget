import type { Meta, StoryObj } from "@storybook/react-native";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import {
	ActiveList,
	type ActiveListInitialState,
	type ActiveListSyncCoordinator,
} from "@/components/active-list";

const emptyList: ActiveListInitialState = {
	householdName: "Avery",
	listName: "Groceries",
	items: [],
};
const STORY_KEYBOARD_HEIGHT = 302;

const meta = {
	title: "Active List/Add Item Composer",
	component: ActiveList.AddItemForm,
} satisfies Meta<typeof ActiveList.AddItemForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => <AddItemComposerStory />,
};

export const Focused: Story = {
	render: () => <AddItemComposerStory initialComposerOpen />,
};

function AddItemComposerStory({
	initialComposerOpen = false,
}: {
	initialComposerOpen?: boolean;
}) {
	const storyKey = initialComposerOpen ? "focused" : "default";
	const actions = storyActions(emptyList);
	const syncCoordinator = storySyncCoordinator();

	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<View key={storyKey} style={styles.canvas}>
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
						<ActiveList.AddItemForm
							initialComposerOpen={initialComposerOpen}
							keyboardHeightOverride={
								initialComposerOpen ? STORY_KEYBOARD_HEIGHT : undefined
							}
						/>
					</ActiveList.Screen>
					{initialComposerOpen ? <IOSKeyboardPreview /> : null}
				</ActiveList.Provider>
			</View>
		</SafeAreaProvider>
	);
}

function IOSKeyboardPreview() {
	return (
		<View accessibilityLabel="iOS keyboard preview" style={styles.keyboard}>
			<View style={styles.keyboardRow}>
				{["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((key) => (
					<KeyPreview key={key} label={key} />
				))}
			</View>
			<View style={styles.keyboardRow}>
				{["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((key) => (
					<KeyPreview key={key} label={key} />
				))}
			</View>
			<View style={styles.keyboardRow}>
				<KeyPreview label="shift" wide />
				{["Z", "X", "C", "V", "B", "N", "M"].map((key) => (
					<KeyPreview key={key} label={key} />
				))}
				<KeyPreview label="delete" wide />
			</View>
			<View style={styles.keyboardRow}>
				<KeyPreview label="123" wide />
				<KeyPreview label="space" fill />
				<KeyPreview label="return" wide />
			</View>
			<View style={styles.homeIndicator} />
		</View>
	);
}

function KeyPreview({
	label,
	fill = false,
	wide = false,
}: {
	label: string;
	fill?: boolean;
	wide?: boolean;
}) {
	return (
		<View
			style={[
				styles.key,
				fill ? styles.keyFill : undefined,
				wide ? styles.keyWide : undefined,
			]}
		>
			<Text style={styles.keyText}>{label}</Text>
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
	addItem: (name: string) => Promise<ActiveListInitialState["items"][number]>;
	setItemChecked: (itemId: string, checked: boolean) => Promise<void>;
} {
	let state = initialState;
	let nextItem = initialState.items.length + 1;

	return {
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
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	keyboard: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: STORY_KEYBOARD_HEIGHT,
		paddingTop: theme.spacing(2),
		paddingHorizontal: theme.spacing(1.5),
		backgroundColor: "rgba(210, 214, 220, 0.96)",
		gap: theme.spacing(1.5),
	},
	keyboardRow: {
		minHeight: theme.spacing(10),
		flexDirection: "row",
		justifyContent: "center",
		gap: theme.spacing(1),
	},
	key: {
		width: theme.spacing(8),
		height: theme.spacing(10),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.spacing(1.5),
		backgroundColor: "rgba(255, 255, 255, 0.96)",
		boxShadow: "0 1px 1px rgba(16, 42, 67, 0.22)",
	},
	keyWide: {
		width: theme.spacing(13),
		backgroundColor: "rgba(174, 181, 191, 0.98)",
	},
	keyFill: {
		flex: 1,
		maxWidth: theme.spacing(45),
	},
	keyText: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.caption,
		fontWeight: theme.fontWeights.medium,
	},
	homeIndicator: {
		alignSelf: "center",
		width: theme.spacing(34),
		height: theme.spacing(1.25),
		marginTop: theme.spacing(1),
		borderRadius: theme.spacing(1),
		backgroundColor: "rgba(16, 42, 67, 0.9)",
	},
}));

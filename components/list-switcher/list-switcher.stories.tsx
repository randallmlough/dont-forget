import type { Meta, StoryObj } from "@storybook/react-native";
import type { ComponentProps } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ListSummary } from "@/lib/services/list";
import { ListSwitcher } from "./list-switcher";
import { ListSwitcherRow } from "./list-switcher-row";

const meta = {
	title: "Lists/ListSwitcher",
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const longName =
	"Saturday warehouse run for the whole Household with backup pantry staples and birthday supplies";

export const ActiveRowsWithCurrentAndDuplicates: Story = {
	render: () => (
		<ListSwitcher
			{...switcherArgs({
				activeLists: [
					listSummary({
						id: "lst_groceries",
						name: "Groceries",
						uncheckedItemCount: 3,
						checkedItemCount: 2,
					}),
					listSummary({
						id: "lst_costco_a",
						name: "Costco",
						uncheckedItemCount: 8,
						checkedItemCount: 1,
					}),
					listSummary({
						id: "lst_costco_b",
						name: "Costco",
						uncheckedItemCount: 1,
						checkedItemCount: 6,
					}),
					listSummary({
						id: "lst_long",
						name: longName,
						uncheckedItemCount: 12,
						checkedItemCount: 0,
					}),
				],
			})}
		/>
	),
};

export const ArchivedRowsAndActions: Story = {
	render: () => (
		<ListSwitcher
			{...switcherArgs({
				activeLists: [],
				currentListId: null,
				hasArchivedLists: true,
				initialSegment: "archived",
				onLoadLists: async ({ archive }) =>
					archive === "archived"
						? [
								listSummary({
									id: "lst_archived",
									name: "Archived Camping",
									archived: true,
									archivedAt: 1_700_000_000_000,
								}),
							]
						: [],
			})}
		/>
	),
};

export const ActiveOverflowActions: Story = {
	render: () => (
		<View style={styles.rowPreview}>
			<ListSwitcherRow
				actionsOpen
				canRenameLists
				currentListId="lst_groceries"
				isArchivedRow={false}
				isRenaming={false}
				isSwitching={false}
				list={listSummary({ id: "lst_costco", name: "Costco" })}
				onSelectList={noop}
				onStartArchive={noop}
				onStartDelete={noop}
				onStartRename={noop}
				onToggleActions={noop}
			/>
		</View>
	),
};

export const ArchivedOverflowActions: Story = {
	render: () => (
		<View style={styles.rowPreview}>
			<ListSwitcherRow
				actionsOpen
				canRenameLists
				currentListId="lst_groceries"
				isArchivedRow
				isRenaming={false}
				isSwitching={false}
				list={listSummary({
					id: "lst_archived",
					name: "Archived Camping",
					archived: true,
					archivedAt: 1_700_000_000_000,
				})}
				onSelectList={noop}
				onStartDelete={noop}
				onStartRename={noop}
				onToggleActions={noop}
				onUnarchiveList={noop}
			/>
		</View>
	),
};

export const LoadError: Story = {
	render: () => (
		<ListSwitcher
			{...switcherArgs({
				activeLists: [],
				onLoadLists: async () => {
					throw new Error("offline");
				},
			})}
		/>
	),
};

export const CreateMode: Story = {
	render: () => (
		<ListSwitcher
			{...switcherArgs({
				activeLists: [],
				currentListId: null,
				initialMode: "create",
			})}
		/>
	),
};

function noop() {}

function switcherArgs(
	overrides: Partial<ComponentProps<typeof ListSwitcher>> = {},
): ComponentProps<typeof ListSwitcher> {
	const activeLists = overrides.activeLists ?? [
		listSummary({ id: "lst_groceries", name: "Groceries" }),
	];
	return {
		visible: true,
		activeLists,
		currentListId: overrides.currentListId ?? activeLists[0]?.id ?? null,
		hasArchivedLists: overrides.hasArchivedLists ?? false,
		initialMode: overrides.initialMode,
		initialSegment: overrides.initialSegment,
		canRenameLists: true,
		onSelectList: async () => undefined,
		onLoadLists: overrides.onLoadLists ?? (async () => activeLists),
		onCreateList: async () => ({ status: "created" }),
		onRenameList: async () => ({ status: "renamed" }),
		onArchiveList: async () => ({ status: "archived" }),
		onDeleteList: async () => ({ status: "deleted" }),
		onUnarchiveList: async () => ({ status: "unarchived" }),
		onClose: () => undefined,
	};
}

function listSummary(overrides: Partial<ListSummary> = {}): ListSummary {
	return {
		id: "lst_groceries",
		householdId: "hh_story",
		name: "Groceries",
		createdByUserId: "usr_avery",
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_000,
		archived: false,
		archivedAt: null,
		lastActivityAt: new Date(2026, 5, 5, 9).getTime(),
		uncheckedItemCount: 0,
		checkedItemCount: 0,
		...overrides,
	};
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		justifyContent: "center",
		backgroundColor: theme.colors.background,
	},
	rowPreview: {
		padding: theme.spacing(5),
	},
}));

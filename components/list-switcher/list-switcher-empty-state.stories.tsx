import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ListSwitcherEmptyState } from "./list-switcher-empty-state";

const meta = {
	title: "Lists/ListSwitcherEmptyState",
	component: ListSwitcherEmptyState,
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
	args: {
		hasArchivedLists: false,
		onCreateList: noop,
		onViewArchived: noop,
		searchText: "",
		segment: "active",
	},
} satisfies Meta<typeof ListSwitcherEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ActiveEmpty: Story = {};

export const ActiveEmptyWithArchivedLists: Story = {
	args: {
		hasArchivedLists: true,
	},
};

export const ArchivedEmpty: Story = {
	args: {
		segment: "archived",
	},
};

export const ActiveNoMatch: Story = {
	args: {
		searchText: "warehouse",
	},
};

export const ArchivedNoMatch: Story = {
	args: {
		searchText: "camping",
		segment: "archived",
	},
};

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		justifyContent: "center",
		padding: theme.spacing(5),
		backgroundColor: theme.colors.surface,
	},
}));

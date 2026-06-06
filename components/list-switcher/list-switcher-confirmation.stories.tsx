import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ListSwitcherConfirmation } from "./list-switcher-confirmation";

const longName =
	"Saturday warehouse run for the whole Household with backup pantry staples and birthday supplies";

const meta = {
	title: "Lists/ListSwitcherConfirmation",
	component: ListSwitcherConfirmation,
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
	args: {
		body: "Groceries will move to Archived Lists. You can restore it later.",
		confirmLabel: "Archive",
		error: null,
		isSubmitting: false,
		onCancel: noop,
		onConfirm: noop,
		submittingLabel: "Archiving",
		title: "Archive this List?",
		variant: "primary",
	},
} satisfies Meta<typeof ListSwitcherConfirmation>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ArchiveConfirmation: Story = {};

export const ArchiveConfirmationLongName: Story = {
	args: {
		body: `${longName} will move to Archived Lists. You can restore it later.`,
	},
};

export const DeleteConfirmation: Story = {
	args: {
		body: "Costco will be removed from the app. This cannot be undone.",
		confirmAccessibilityHint: "Permanently removes Costco",
		confirmLabel: "Delete",
		submittingLabel: "Deleting",
		title: "Delete this List?",
		variant: "destructive",
	},
};

export const DeleteConfirmationBusy: Story = {
	args: {
		body: "Costco will be removed from the app. This cannot be undone.",
		confirmAccessibilityHint: "Permanently removes Costco",
		confirmLabel: "Delete",
		isSubmitting: true,
		submittingLabel: "Deleting",
		title: "Delete this List?",
		variant: "destructive",
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

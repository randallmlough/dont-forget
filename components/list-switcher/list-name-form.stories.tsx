import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ListNameForm } from "./list-name-form";

const meta = {
	title: "Lists/ListNameForm",
	component: ListNameForm,
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
	args: {
		canSubmit: false,
		draft: "",
		error: null,
		isSubmitting: false,
		isTooLong: false,
		onCancel: noop,
		onChangeDraft: noop,
		onSubmit: noop,
		submitLabel: "Create",
		submittingLabel: "Creating",
		title: "Create List",
	},
} satisfies Meta<typeof ListNameForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CreateEmpty: Story = {};

export const CreateValid: Story = {
	args: {
		canSubmit: true,
		draft: "Costco",
	},
};

export const CreateInvalid: Story = {
	args: {
		canSubmit: false,
		draft:
			"Saturday warehouse run for the whole Household with backup pantry staples and birthday supplies",
		isTooLong: true,
	},
};

export const CreateSubmitting: Story = {
	args: {
		canSubmit: false,
		draft: "Costco",
		isSubmitting: true,
	},
};

export const CreateServiceError: Story = {
	args: {
		canSubmit: true,
		draft: "Costco",
		error: "Unable to create this List. Please try again.",
	},
};

export const RenameUnchanged: Story = {
	args: {
		canSubmit: true,
		draft: "Groceries",
		submitLabel: "Save",
		submittingLabel: "Saving",
		title: "Rename List",
	},
};

export const RenameInvalid: Story = {
	args: {
		canSubmit: false,
		draft:
			"Saturday warehouse run for the whole Household with backup pantry staples and birthday supplies",
		isTooLong: true,
		submitLabel: "Save",
		submittingLabel: "Saving",
		title: "Rename List",
	},
};

export const RenameSubmitting: Story = {
	args: {
		canSubmit: false,
		draft: "Warehouse",
		isSubmitting: true,
		submitLabel: "Save",
		submittingLabel: "Saving",
		title: "Rename List",
	},
};

export const RenameServiceError: Story = {
	args: {
		canSubmit: true,
		draft: "Warehouse",
		error: "List could not be renamed.",
		submitLabel: "Save",
		submittingLabel: "Saving",
		title: "Rename List",
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

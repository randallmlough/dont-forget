import { HomeScreenView } from "@mobile/screens/app/home-screen";
import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const meta = {
	title: "screens/app/HomeScreen",
	component: HomeScreenView,
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta<typeof HomeScreenView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
	args: {
		state: { status: "loading" },
	},
};

export const AuthenticatedAppSessionError: Story = {
	args: {
		state: {
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		},
		onRetry: noop,
	},
};

export const DifferentUserBlocked: Story = {
	args: {
		state: { status: "loading" },
		localData: {
			status: "differentUserBlocked",
			isRemoving: false,
			errorMessage: null,
		},
		onSignInAsPreviousUser: noop,
		onRemovePreviousUserDataAndContinue: noop,
	},
};

export const PreviousUserDataRemovalInProgress: Story = {
	args: {
		...DifferentUserBlocked.args,
		localData: {
			status: "differentUserBlocked",
			isRemoving: true,
			errorMessage: null,
		},
	},
};

export const PreviousUserDataRemovalFailed: Story = {
	args: {
		...DifferentUserBlocked.args,
		localData: {
			status: "differentUserBlocked",
			isRemoving: false,
			errorMessage:
				"Unable to remove the previous User's data. Please try again.",
		},
	},
};

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

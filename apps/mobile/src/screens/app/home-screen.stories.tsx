import {
	HomeScreenView,
	type HomeScreenViewProps,
} from "@mobile/screens/app/home-screen";
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
} satisfies Meta<HomeScreenViewProps>;

export default meta;

type Story = StoryObj<HomeScreenViewProps>;

const loadingArgs = {
	state: { status: "loading" },
} satisfies HomeScreenViewProps;

export const Loading: Story = {
	args: loadingArgs,
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

const differentUserBlockedArgs = {
	state: { status: "loading" },
	localData: {
		status: "differentUserBlocked",
		phase: "idle",
	},
	onSignInAsPreviousUser: noop,
	onRemovePreviousUserDataAndContinue: noop,
} satisfies HomeScreenViewProps;

export const DifferentUserBlocked: Story = {
	args: differentUserBlockedArgs,
};

export const PreviousUserDataRemovalInProgress: Story = {
	args: {
		...DifferentUserBlocked.args,
		localData: {
			status: "differentUserBlocked",
			phase: "removing",
		},
	},
};

export const PreviousUserDataRemovalFailed: Story = {
	args: {
		...DifferentUserBlocked.args,
		localData: {
			status: "differentUserBlocked",
			phase: "failed",
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

import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HomeScreenView } from "@/client/screens/app/home-screen";

const meta = {
	title: "Home/HomeScreen",
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

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AuthFooterLink } from "@/client/features/auth/auth-footer-link";
import { AuthScreen } from "@/client/features/auth/auth-screen";
import { AuthTextInput } from "@/client/features/auth/auth-text-input";
import { OrDivider } from "@/client/features/auth/or-divider";
import { Button } from "@/client/ui/button";

const meta = {
	title: "Auth/AuthScreen",
	component: AuthScreen,
	args: {
		title: "Don't Forget",
		children: null,
	},
	decorators: [
		(Story) => (
			<View style={styles.canvas}>
				<Story />
			</View>
		),
	],
} satisfies Meta<typeof AuthScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SignIn: Story = {
	render: () => (
		<AuthScreen
			title="Don't Forget"
			subtitle="Shared Lists for your Household."
		>
			<AuthTextInput
				placeholder="Email"
				autoComplete="email"
				keyboardType="email-address"
				textContentType="emailAddress"
				value=""
				onChangeText={noop}
			/>
			<AuthTextInput
				placeholder="Password"
				autoComplete="current-password"
				secureTextEntry
				textContentType="password"
				value=""
				onChangeText={noop}
			/>
			<Button onPress={noop} radius="xl" size="lg">
				Sign in
			</Button>
			<AuthFooterLink
				prompt="Don't have an account?"
				label="Sign up"
				href="/sign-up"
			/>
		</AuthScreen>
	),
};

export const Verification: Story = {
	render: () => (
		<AuthScreen
			title="Create your account"
			subtitle="We sent a verification code to avery@example.com."
		>
			<AuthTextInput
				placeholder="Verification code"
				keyboardType="number-pad"
				autoComplete="one-time-code"
				textContentType="oneTimeCode"
				value=""
				onChangeText={noop}
			/>
			<Button onPress={noop} radius="xl" size="lg">
				Verify email
			</Button>
		</AuthScreen>
	),
};

export const WithDivider: Story = {
	render: () => (
		<AuthScreen
			title="Create your account"
			subtitle="Join your Household in seconds."
		>
			<Button onPress={noop} radius="xl" size="lg">
				Continue with Apple
			</Button>
			<OrDivider />
			<AuthTextInput
				placeholder="Email"
				autoComplete="email"
				keyboardType="email-address"
				textContentType="emailAddress"
				value=""
				onChangeText={noop}
			/>
			<Button onPress={noop} radius="xl" size="lg">
				Create account
			</Button>
		</AuthScreen>
	),
};

function noop() {}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

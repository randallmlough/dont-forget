import { textContentType } from "@expo/ui/swift-ui/modifiers";
import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { AuthFooterLink } from "@mobile/features/auth/auth-footer-link";
import { AuthScreen } from "@mobile/features/auth/auth-screen";
import { OrDivider } from "@mobile/features/auth/or-divider";
import { Button } from "@mobile/ui/button";
import { Field, FieldGroup, FieldLabel } from "@mobile/ui/field";
import { Form } from "@mobile/ui/form";
import { Input } from "@mobile/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@mobile/ui/input-otp";

const VERIFICATION_CODE_INDICES = [0, 1, 2, 3, 4, 5] as const;
const VERIFICATION_CODE_PATTERN = /\d/;

const meta = {
	title: "Features/Auth/AuthScreen",
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
			<Form>
				<FieldGroup>
					<Field>
						<FieldLabel>Email</FieldLabel>
						<Input
							accessibilityLabel="Email"
							kind="email"
							placeholder="Email"
						/>
					</Field>
					<Field>
						<FieldLabel>Password</FieldLabel>
						<Input
							accessibilityLabel="Password"
							modifiers={[textContentType("password")]}
							placeholder="Password"
							secureTextEntry
						/>
					</Field>
				</FieldGroup>
				<Button onPress={noop} radius="xl" size="lg">
					Sign in
				</Button>
			</Form>
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
			<Form>
				<Field>
					<FieldLabel>Verification code</FieldLabel>
					<InputOTP
						accessibilityLabel="Verification code"
						maxLength={6}
						pattern={VERIFICATION_CODE_PATTERN}
					>
						<InputOTPGroup>
							{VERIFICATION_CODE_INDICES.map((index) => (
								<InputOTPSlot index={index} key={index} />
							))}
						</InputOTPGroup>
					</InputOTP>
				</Field>
				<Button onPress={noop} radius="xl" size="lg">
					Verify email
				</Button>
			</Form>
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
			<Form>
				<Field>
					<FieldLabel>Email</FieldLabel>
					<Input accessibilityLabel="Email" kind="email" placeholder="Email" />
				</Field>
				<Button onPress={noop} radius="xl" size="lg">
					Create account
				</Button>
			</Form>
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

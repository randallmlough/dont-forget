import { useSignUp } from "@clerk/clerk-expo";
import {
	onSubmit as onSubmitModifier,
	submitLabel,
	textContentType,
} from "@expo/ui/swift-ui/modifiers";
import { AuthFooterLink } from "@mobile/features/auth/auth-footer-link";
import { AuthScreen } from "@mobile/features/auth/auth-screen";
import { OrDivider } from "@mobile/features/auth/or-divider";
import { authHrefWithIntent } from "@mobile/features/auth/redirect-policy";
import { SocialSignIn } from "@mobile/features/auth/social-sign-in";
import { track } from "@mobile/lib/analytics";
import { userMessage } from "@mobile/lib/clerk-errors";
import { Button } from "@mobile/ui/button";
import { Field, FieldGroup, FieldLabel } from "@mobile/ui/field";
import { Form } from "@mobile/ui/form";
import { Input } from "@mobile/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@mobile/ui/input-otp";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_CODE_INDICES = [0, 1, 2, 3, 4, 5] as const;
const VERIFICATION_CODE_PATTERN = /\d/;

export default function SignUpScreen() {
	const [pendingEmail, setPendingEmail] = useState<string | null>(null);
	const params = useLocalSearchParams();

	if (pendingEmail) {
		return (
			<AuthScreen
				title="Create your account"
				subtitle={`We sent a verification code to ${pendingEmail}.`}
			>
				<VerifyEmailForm onBack={() => setPendingEmail(null)} />
			</AuthScreen>
		);
	}

	return (
		<AuthScreen
			title="Create your account"
			subtitle="Join your household in seconds."
		>
			<SocialSignIn />
			<OrDivider />
			<CreateAccountForm onPendingVerification={setPendingEmail} />
			<AuthFooterLink
				prompt="Already have an account?"
				label="Sign in"
				href={authHrefWithIntent("/sign-in", params)}
			/>
		</AuthScreen>
	);
}

function CreateAccountForm({
	onPendingVerification,
}: {
	onPendingVerification: (email: string) => void;
}) {
	const { signUp, setActive, isLoaded } = useSignUp();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function onCreate() {
		if (!isLoaded) return;
		const trimmedEmail = email.trim();
		if (!trimmedEmail || !password) {
			Alert.alert("Missing info", "Enter your email and a password.");
			return;
		}
		if (password !== confirm) {
			Alert.alert(
				"Passwords don't match",
				"Re-enter your password to confirm.",
			);
			return;
		}
		setSubmitting(true);
		try {
			const attempt = await signUp.create({
				emailAddress: trimmedEmail,
				password,
			});
			if (attempt.createdSessionId) {
				track("user_signed_up", { method: "email" });
				await setActive({ session: attempt.createdSessionId });
				return;
			}
			await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
			track("user_signed_up", { method: "email" });
			onPendingVerification(trimmedEmail);
		} catch (error) {
			Alert.alert("Sign up failed", userMessage(error));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Form>
			<FieldGroup>
				<Field disabled={submitting}>
					<FieldLabel>Email</FieldLabel>
					<Input
						accessibilityLabel="Email"
						kind="email"
						onTextChange={setEmail}
						placeholder="Email"
					/>
				</Field>
				<Field disabled={submitting}>
					<FieldLabel>Password</FieldLabel>
					<Input
						accessibilityLabel="Password"
						modifiers={[textContentType("newPassword")]}
						onTextChange={setPassword}
						placeholder="Password (8+ characters)"
						secureTextEntry
					/>
				</Field>
				<Field disabled={submitting}>
					<FieldLabel>Confirm password</FieldLabel>
					<Input
						accessibilityLabel="Confirm password"
						modifiers={[
							textContentType("newPassword"),
							submitLabel("done"),
							onSubmitModifier(() => {
								void onCreate();
							}),
						]}
						onTextChange={setConfirm}
						placeholder="Confirm password"
						secureTextEntry
					/>
				</Field>
			</FieldGroup>
			<Button loading={submitting} onPress={onCreate} radius="xl" size="lg">
				Create account
			</Button>
		</Form>
	);
}

function VerifyEmailForm({ onBack }: { onBack: () => void }) {
	const { signUp, setActive, isLoaded } = useSignUp();
	const [code, setCode] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function onVerify() {
		if (!isLoaded) return;
		const trimmedCode = code.trim();
		if (!trimmedCode) {
			Alert.alert(
				"Enter the code",
				"Check your email for the verification code.",
			);
			return;
		}
		setSubmitting(true);
		try {
			const attempt = await signUp.attemptEmailAddressVerification({
				code: trimmedCode,
			});
			if (attempt.createdSessionId) {
				track("user_email_verified", {});
				await setActive({ session: attempt.createdSessionId });
				return;
			}
			Alert.alert("Verification incomplete", "Please try again.");
		} catch (error) {
			Alert.alert("Verification failed", userMessage(error));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Form>
			<Field disabled={submitting}>
				<FieldLabel>Verification code</FieldLabel>
				<InputOTP
					accessibilityLabel="Verification code"
					maxLength={VERIFICATION_CODE_LENGTH}
					onChangeText={setCode}
					pattern={VERIFICATION_CODE_PATTERN}
					value={code}
				>
					<InputOTPGroup>
						{VERIFICATION_CODE_INDICES.map((index) => (
							<InputOTPSlot index={index} key={index} />
						))}
					</InputOTPGroup>
				</InputOTP>
			</Field>
			<Button loading={submitting} onPress={onVerify} radius="xl" size="lg">
				Verify email
			</Button>
			<Button
				disabled={submitting}
				onPress={onBack}
				style={styles.backButton}
				textStyle={styles.backLabel}
				variant="ghost"
			>
				Use a different email
			</Button>
		</Form>
	);
}

const styles = StyleSheet.create((theme) => ({
	backButton: {
		alignItems: "center",
		justifyContent: "center",
		minHeight: theme.spacing(11),
		paddingVertical: theme.spacing(2),
	},
	backLabel: {
		...theme.typography.callout,
		color: theme.colors.link,
		fontWeight: theme.fontWeights.medium,
	},
}));

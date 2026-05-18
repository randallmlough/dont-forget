import { useSignUp } from "@clerk/clerk-expo";
import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AuthFooterLink } from "@/components/auth/auth-footer-link";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthTextInput } from "@/components/auth/auth-text-input";
import { OrDivider } from "@/components/auth/or-divider";
import { PrimaryButton } from "@/components/auth/primary-button";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { track } from "@/lib/analytics";
import { userMessage } from "@/lib/clerk-errors";

export default function SignUpScreen() {
	const [pendingEmail, setPendingEmail] = useState<string | null>(null);

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
				href="/sign-in"
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
		<>
			<AuthTextInput
				placeholder="Email"
				autoComplete="email"
				keyboardType="email-address"
				textContentType="emailAddress"
				value={email}
				onChangeText={setEmail}
				editable={!submitting}
			/>
			<AuthTextInput
				placeholder="Password (8+ characters)"
				autoComplete="new-password"
				secureTextEntry
				textContentType="newPassword"
				value={password}
				onChangeText={setPassword}
				editable={!submitting}
			/>
			<AuthTextInput
				placeholder="Confirm password"
				autoComplete="new-password"
				secureTextEntry
				textContentType="newPassword"
				value={confirm}
				onChangeText={setConfirm}
				editable={!submitting}
				onSubmitEditing={onCreate}
			/>
			<PrimaryButton
				label="Create account"
				onPress={onCreate}
				loading={submitting}
			/>
		</>
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
		<>
			<AuthTextInput
				placeholder="Verification code"
				keyboardType="number-pad"
				autoComplete="one-time-code"
				textContentType="oneTimeCode"
				value={code}
				onChangeText={setCode}
				editable={!submitting}
				onSubmitEditing={onVerify}
			/>
			<PrimaryButton
				label="Verify email"
				onPress={onVerify}
				loading={submitting}
			/>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ disabled: submitting }}
				onPress={onBack}
				disabled={submitting}
				style={styles.backButton}
			>
				<Text style={styles.backLabel}>Use a different email</Text>
			</Pressable>
		</>
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

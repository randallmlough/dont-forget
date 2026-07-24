import { useSignUp } from "@clerk/clerk-expo";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AuthFooterLink } from "@/client/features/auth/auth-footer-link";
import { AuthScreen } from "@/client/features/auth/auth-screen";
import { AuthTextInput } from "@/client/features/auth/auth-text-input";
import { OrDivider } from "@/client/features/auth/or-divider";
import { authHrefWithIntent } from "@/client/features/auth/redirect-policy";
import { SocialSignIn } from "@/client/features/auth/social-sign-in";
import { track } from "@/client/lib/analytics";
import { userMessage } from "@/client/lib/clerk-errors";
import { Button } from "@/client/ui/button";

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
			<Button loading={submitting} onPress={onCreate} radius="xl" size="lg">
				Create account
			</Button>
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

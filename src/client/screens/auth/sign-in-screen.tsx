import { useSignIn } from "@clerk/clerk-expo";
import {
	onSubmit as onSubmitModifier,
	submitLabel,
	textContentType,
} from "@expo/ui/swift-ui/modifiers";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { AuthFooterLink } from "@/client/features/auth/auth-footer-link";
import { AuthScreen } from "@/client/features/auth/auth-screen";
import { OrDivider } from "@/client/features/auth/or-divider";
import { authHrefWithIntent } from "@/client/features/auth/redirect-policy";
import { SocialSignIn } from "@/client/features/auth/social-sign-in";
import { track } from "@/client/lib/analytics";
import { userMessage } from "@/client/lib/clerk-errors";
import { Button } from "@/client/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/client/ui/field";
import { Form } from "@/client/ui/form";
import { Input } from "@/client/ui/input";

export default function SignInScreen() {
	const { signIn, setActive, isLoaded } = useSignIn();
	const params = useLocalSearchParams();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function onSubmit() {
		if (!isLoaded) return;
		const identifier = email.trim();
		if (!identifier || !password) {
			Alert.alert("Missing info", "Enter your email and password.");
			return;
		}
		setSubmitting(true);
		try {
			const attempt = await signIn.create({ identifier, password });
			if (attempt.createdSessionId) {
				track("user_signed_in", { method: "email" });
				await setActive({ session: attempt.createdSessionId });
				return;
			}
			Alert.alert(
				"Sign in incomplete",
				"Additional steps are required to sign in.",
			);
		} catch (error) {
			Alert.alert("Sign in failed", userMessage(error));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<AuthScreen
			title="Don't Forget"
			subtitle="Shared shopping lists for your household."
		>
			<SocialSignIn />
			<OrDivider />
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
							modifiers={[
								textContentType("password"),
								submitLabel("done"),
								onSubmitModifier(() => {
									void onSubmit();
								}),
							]}
							onTextChange={setPassword}
							placeholder="Password"
							secureTextEntry
						/>
					</Field>
				</FieldGroup>
				<Button loading={submitting} onPress={onSubmit} radius="xl" size="lg">
					Sign in
				</Button>
			</Form>
			<AuthFooterLink
				prompt="Don't have an account?"
				label="Sign up"
				href={authHrefWithIntent("/sign-up", params)}
			/>
		</AuthScreen>
	);
}

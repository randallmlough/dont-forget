import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Alert, Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { track } from "@mobile/lib/analytics";
import { userMessage } from "@mobile/lib/clerk-errors";

const APPLE_CANCELED_CODE = "ERR_REQUEST_CANCELED";

WebBrowser.maybeCompleteAuthSession();

export function SocialSignIn() {
	const { theme } = useUnistyles();
	const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
	const { signUp, isLoaded: signUpLoaded } = useSignUp();
	const { startSSOFlow } = useSSO();

	async function onApplePress() {
		if (!signInLoaded || !signUpLoaded) return;
		try {
			// Clerk verifies the nonce hash embedded in Apple's identity token JWT;
			// omitting it causes "Unauthorized request".
			const nonce = Crypto.randomUUID();
			const credential = await AppleAuthentication.signInAsync({
				requestedScopes: [
					AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
					AppleAuthentication.AppleAuthenticationScope.EMAIL,
				],
				nonce,
			});

			if (!credential.identityToken) {
				throw new Error("Apple did not return an identity token");
			}

			await signIn.create({
				strategy: "oauth_token_apple",
				token: credential.identityToken,
			});

			const sessionId =
				signIn.firstFactorVerification.status === "transferable"
					? await transferToSignUp(signUp, credential)
					: signIn.createdSessionId;

			if (sessionId) {
				track("user_signed_in", { method: "apple" });
				await setActive({ session: sessionId });
				return;
			}
			Alert.alert("Sign in incomplete", "Please try again.");
		} catch (error) {
			if (isAppleCanceledError(error)) return;
			Alert.alert("Sign in failed", userMessage(error));
		}
	}

	async function onGooglePress() {
		try {
			const result = await startSSOFlow({ strategy: "oauth_google" });
			if (isCanceledAuthSession(result.authSessionResult)) return;
			if (result.createdSessionId && result.setActive) {
				track("user_signed_in", { method: "google" });
				await result.setActive({ session: result.createdSessionId });
				return;
			}
			Alert.alert("Sign in incomplete", "Please try again.");
		} catch (error) {
			Alert.alert("Sign in failed", userMessage(error));
		}
	}

	return (
		<>
			<AppleAuthentication.AppleAuthenticationButton
				buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
				buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
				cornerRadius={theme.radii.xl}
				style={styles.providerButton}
				onPress={onApplePress}
			/>
			<Pressable
				accessibilityRole="button"
				onPress={onGooglePress}
				style={({ pressed }) => [
					styles.providerButton,
					styles.googleButton,
					pressed && styles.googleButtonPressed,
				]}
			>
				<Text style={styles.googleLabel}>Continue with Google</Text>
			</Pressable>
		</>
	);
}

async function transferToSignUp(
	signUp: ReturnType<typeof useSignUp>["signUp"],
	credential: AppleAuthentication.AppleAuthenticationCredential,
): Promise<string | null> {
	if (!signUp) return null;
	await signUp.create({
		transfer: true,
		emailAddress: credential.email ?? undefined,
		firstName: credential.fullName?.givenName ?? undefined,
		lastName: credential.fullName?.familyName ?? undefined,
	});
	return signUp.createdSessionId;
}

function isAppleCanceledError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === APPLE_CANCELED_CODE
	);
}

function isCanceledAuthSession(
	result: WebBrowser.WebBrowserAuthSessionResult | null | undefined,
): boolean {
	if (!result) return false;
	return (
		result.type === "cancel" ||
		result.type === "dismiss" ||
		result.type === "locked"
	);
}

const styles = StyleSheet.create((theme) => ({
	providerButton: {
		width: "100%",
		height: theme.spacing(13),
	},
	googleButton: {
		backgroundColor: theme.colors.card,
		borderRadius: theme.radii.xl,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	googleButtonPressed: {
		opacity: theme.opacities.disabled,
	},
	googleLabel: {
		color: theme.colors.foreground,
		fontSize: theme.fontSizes.lg,
		fontWeight: theme.fontWeights.medium,
	},
}));

import { useSignIn, useSignUp, isClerkAPIResponseError } from "@clerk/clerk-expo";
import { StyleSheet, View, Text, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

const APPLE_CANCELED_CODE = "ERR_REQUEST_CANCELED";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  async function onApplePress() {
    if (!signInLoaded || !signUpLoaded) return;
    const activate = setActive;

    async function activateOrReport(
      label: string,
      sessionId: string | null | undefined,
      status: string | null | undefined,
      missingFields?: readonly string[],
    ) {
      if (sessionId) {
        await activate({ session: sessionId });
        return;
      }
      console.warn(`[sign-in] ${label} incomplete`, { status, missingFields });
      Alert.alert(`${label} incomplete`, "Please try again.");
    }

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

      if (signIn.firstFactorVerification.status === "transferable") {
        await signUp.create({
          transfer: true,
          emailAddress: credential.email ?? undefined,
          firstName: credential.fullName?.givenName ?? undefined,
          lastName: credential.fullName?.familyName ?? undefined,
        });
        await activateOrReport("Sign up", signUp.createdSessionId, signUp.status, signUp.missingFields);
        return;
      }

      await activateOrReport("Sign in", signIn.createdSessionId, signIn.status);
    } catch (error) {
      if (isAppleCanceledError(error)) return;
      Alert.alert("Sign in failed", userMessage(error));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Don&apos;t Forget</Text>
      <Text style={styles.subtitle}>Shared shopping lists for your household.</Text>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={8}
        style={styles.appleButton}
        onPress={onApplePress}
      />
    </View>
  );
}

function isAppleCanceledError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === APPLE_CANCELED_CODE
  );
}

function userMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) return error.errors[0]?.message ?? "Sign in failed";
  if (error instanceof Error) return error.message;
  return "Sign in failed";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    textAlign: "center",
    marginBottom: 24,
  },
  appleButton: {
    width: "100%",
    height: 52,
  },
});

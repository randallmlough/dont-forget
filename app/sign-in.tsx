import { useSignIn, useSignUp, isClerkAPIResponseError } from "@clerk/clerk-expo";
import { StyleSheet, View, Text, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useCallback } from "react";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();

  const onApplePress = useCallback(async () => {
    if (!signInLoaded || !signUpLoaded) return;
    try {
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

      const needsSignUp = signIn.firstFactorVerification.status === "transferable";
      if (needsSignUp) {
        await signUp.create({
          transfer: true,
          emailAddress: credential.email ?? undefined,
          firstName: credential.fullName?.givenName ?? undefined,
          lastName: credential.fullName?.familyName ?? undefined,
        });
        if (signUp.createdSessionId) {
          await setActive({ session: signUp.createdSessionId });
        } else {
          Alert.alert(
            "Sign up incomplete",
            `status=${signUp.status} missing=${(signUp.missingFields ?? []).join(",") || "none"}`,
          );
        }
        return;
      }

      if (signIn.createdSessionId) {
        await setActive({ session: signIn.createdSessionId });
      } else {
        Alert.alert("Sign in incomplete", `status=${signIn.status}`);
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        return;
      }
      const message = isClerkAPIResponseError(error)
        ? error.errors[0]?.message ?? "Sign in failed"
        : error instanceof Error
          ? error.message
          : "Sign in failed";
      Alert.alert("Sign in failed", message);
    }
  }, [signIn, signUp, setActive, signInLoaded, signUpLoaded]);

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

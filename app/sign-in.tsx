import { useSSO } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { StyleSheet, View, Text, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useCallback } from "react";

export default function SignInScreen() {
  const { startSSOFlow } = useSSO();

  const onApplePress = useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_apple",
        redirectUrl: Linking.createURL("/oauth-callback"),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign in failed";
      Alert.alert("Sign in failed", message);
    }
  }, [startSSOFlow]);

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

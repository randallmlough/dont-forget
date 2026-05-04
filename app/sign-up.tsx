import { useSignUp } from "@clerk/clerk-expo";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SocialSignIn, userMessage } from "@/components/social-sign-in";

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onCreate() {
    if (!isLoaded || submitting) return;
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email and a password.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Re-enter your password to confirm.");
      return;
    }
    setSubmitting(true);
    try {
      const attempt = await signUp.create({ emailAddress: email.trim(), password });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (error) {
      Alert.alert("Sign up failed", userMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify() {
    if (!isLoaded || submitting) return;
    if (!code.trim()) {
      Alert.alert("Enter the code", "Check your email for the verification code.");
      return;
    }
    setSubmitting(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      console.warn("[sign-up] verification incomplete", { status: attempt.status });
      Alert.alert("Verification incomplete", "Please try again.");
    } catch (error) {
      Alert.alert("Verification failed", userMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          {pendingVerification
            ? `We sent a verification code to ${email.trim()}.`
            : "Join your household in seconds."}
        </Text>

        {pendingVerification ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Verification code"
              placeholderTextColor="#9aa0a6"
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
              submitting={submitting}
            />
            <Pressable
              onPress={() => setPendingVerification(false)}
              disabled={submitting}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Use a different email</Text>
            </Pressable>
          </>
        ) : (
          <>
            <SocialSignIn />

            <Divider />

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9aa0a6"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Password (8+ characters)"
              placeholderTextColor="#9aa0a6"
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#9aa0a6"
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              textContentType="newPassword"
              value={confirm}
              onChangeText={setConfirm}
              editable={!submitting}
              onSubmitEditing={onCreate}
            />
            <PrimaryButton label="Create account" onPress={onCreate} submitting={submitting} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/sign-in" replace style={styles.footerLink}>
                Sign in
              </Link>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PrimaryButton({
  label,
  onPress,
  submitting,
}: {
  label: string;
  onPress: () => void;
  submitting: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={submitting}
      style={({ pressed }) => [
        styles.primaryButton,
        (pressed || submitting) && styles.primaryButtonPressed,
      ]}>
      {submitting ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryButtonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.6,
    textAlign: "center",
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dadce0",
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: "#fff",
    color: "#1f1f1f",
  },
  primaryButton: {
    height: 52,
    borderRadius: 8,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    opacity: 0.7,
  },
  primaryButtonLabel: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  secondaryButtonLabel: {
    color: "#1a73e8",
    fontSize: 15,
    fontWeight: "500",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#c0c0c0",
  },
  dividerText: {
    fontSize: 13,
    color: "#9aa0a6",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
  },
  footerText: {
    color: "#5f6368",
    fontSize: 15,
  },
  footerLink: {
    color: "#1a73e8",
    fontSize: 15,
    fontWeight: "600",
  },
});

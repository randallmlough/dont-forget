import { useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { Alert } from "react-native";
import { AuthFooterLink } from "@/components/auth/auth-footer-link";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AuthTextInput } from "@/components/auth/auth-text-input";
import { OrDivider } from "@/components/auth/or-divider";
import { PrimaryButton } from "@/components/auth/primary-button";
import { SocialSignIn } from "@/components/auth/social-sign-in";
import { userMessage } from "@/lib/clerk-errors";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
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
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      Alert.alert("Sign in incomplete", "Additional steps are required to sign in.");
    } catch (error) {
      Alert.alert("Sign in failed", userMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen title="Don't Forget" subtitle="Shared shopping lists for your household.">
      <SocialSignIn />
      <OrDivider />
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
        placeholder="Password"
        autoComplete="current-password"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
        onSubmitEditing={onSubmit}
      />
      <PrimaryButton label="Sign in" onPress={onSubmit} loading={submitting} />
      <AuthFooterLink prompt="Don't have an account?" label="Sign up" href="/sign-up" />
    </AuthScreen>
  );
}

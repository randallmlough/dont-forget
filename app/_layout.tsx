import { ThemeProvider } from "@react-navigation/native";
import { ClerkLoaded, ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef } from "react";
import "react-native-reanimated";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { PostHogProvider } from "posthog-react-native";

import { tokenCache } from "@/lib/token-cache";
import { posthog } from "@/lib/posthog";
import { screen, useAnalyticsIdentity } from "@/lib/analytics";
import { navigationTheme } from "@/navigation-theme";

export const unstable_settings = {
  anchor: "index",
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in env. Copy .env.example to .env.local and fill it in.",
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      screen(pathname, { previous_screen: previousPathname.current ?? null, ...params });
      previousPathname.current = pathname;
    }
  }, [pathname, params]);

  return (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: true, propsToCapture: ["testID"] }}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          <ClerkLoaded>
            <ThemeProvider value={navigationTheme}>
              <AuthGate />
              <StatusBar style="dark" />
            </ThemeProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </SafeAreaProvider>
    </PostHogProvider>
  );
}

const AUTH_SEGMENTS = ["sign-in", "sign-up"];

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const onAuthScreen = AUTH_SEGMENTS.some((s) => s === segments[0]);

  useAnalyticsIdentity();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !onAuthScreen) {
      router.replace("/sign-in");
    } else if (isSignedIn && onAuthScreen) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, onAuthScreen, router]);

  // Warm up the OAuth browser once while signed-out so the first SSO tap is snappy.
  // Hoisted out of the auth screens so swapping sign-in ↔ sign-up doesn't thrash.
  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, [isLoaded, isSignedIn]);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
    </Stack>
  );
}

import { ClerkLoaded, ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import {
	Stack,
	useGlobalSearchParams,
	usePathname,
	useRouter,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef } from "react";
import "react-native-reanimated";
import { PostHogProvider } from "posthog-react-native";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";
import { screen, useAnalyticsIdentity } from "@/lib/analytics";
import { readAppEnvFromExpoExtra, validateClerkKeyForEnv } from "@/lib/env";
import { posthog } from "@/lib/posthog";
import { tokenCache } from "@/lib/token-cache";
import { navigationTheme } from "@/lib/unistyles/navigation-theme";

export const unstable_settings = {
	anchor: "(app)",
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const appEnv = readAppEnvFromExpoExtra(Constants.expoConfig?.extra);

if (!publishableKey) {
	throw new Error(
		"Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in env. Copy .env.example to .env.local and fill it in with APP_ENV=local.",
	);
}

validateClerkKeyForEnv(
	appEnv,
	"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
	publishableKey,
);

export default function RootLayout() {
	const pathname = usePathname();
	const params = useGlobalSearchParams();
	const previousPathname = useRef<string | undefined>(undefined);

	useEffect(() => {
		if (previousPathname.current !== pathname) {
			screen(pathname, {
				previous_screen: previousPathname.current ?? null,
				...params,
			});
			previousPathname.current = pathname;
		}
	}, [pathname, params]);

	return (
		<PostHogProvider
			client={posthog}
			autocapture={{
				captureScreens: false,
				captureTouches: true,
				propsToCapture: ["testID"],
			}}
		>
			<SafeAreaProvider initialMetrics={initialWindowMetrics}>
				<ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
					<ClerkLoaded>
						<ThemeProvider value={navigationTheme}>
							<AuthGate pathname={pathname} />
							<StatusBar style="dark" />
						</ThemeProvider>
					</ClerkLoaded>
				</ClerkProvider>
			</SafeAreaProvider>
		</PostHogProvider>
	);
}

const AUTH_PATHS = new Set(["/sign-in", "/sign-up"]);

function AuthGate({ pathname }: { pathname: string }) {
	const { isSignedIn, isLoaded } = useAuth();
	const router = useRouter();
	const onAuthScreen = AUTH_PATHS.has(pathname);

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
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="(app)" />
			<Stack.Screen name="(auth)" />
		</Stack>
	);
}

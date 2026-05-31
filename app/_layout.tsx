import { ClerkProvider } from "@clerk/clerk-expo";
import { ThemeProvider } from "@react-navigation/native";
import Constants from "expo-constants";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import "react-native-reanimated";
import { PostHogProvider } from "posthog-react-native";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";

import { AuthGate } from "@/components/auth/auth-gate";
import { screen } from "@/lib/analytics";
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
					<ThemeProvider value={navigationTheme}>
						<AuthGate pathname={pathname} params={params} />
						<StatusBar style="dark" />
					</ThemeProvider>
				</ClerkProvider>
			</SafeAreaProvider>
		</PostHogProvider>
	);
}

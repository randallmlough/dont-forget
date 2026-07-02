import { ClerkProvider } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { ThemeProvider } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef } from "react";
import "react-native-reanimated";
import { PostHogProvider } from "posthog-react-native";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { AuthGate } from "@/client/features/auth/auth-gate";
import {
	AUTH_PATHS,
	PUBLIC_AUTH_PRESERVING_PATHS,
} from "@/client/features/auth/redirect-policy";
import { AuthenticatedAppSessionProvider } from "@/client/session";
import { screen } from "@/client/lib/analytics";
import { readAppEnvFromExpoExtra, validateClerkKeyForEnv } from "@/shared/env";
import { logger } from "@/client/lib/logger";
import { posthog } from "@/client/lib/posthog";
import { tokenCache } from "@/client/lib/token-cache";
import "@/client/theme/unistyles";
import { loadAndApplyAppearancePreference } from "@/client/theme/appearance-preference";
import { navigationThemeFor } from "@/client/theme/navigation-theme";

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
	const { theme, rt } = useUnistyles();
	const isDarkTheme = rt.themeName === "dark";
	const navigationTheme = useMemo(
		() => navigationThemeFor(theme, isDarkTheme),
		[theme, isDarkTheme],
	);

	useEffect(() => {
		if (previousPathname.current !== pathname) {
			screen(pathname, {
				previous_screen: previousPathname.current ?? null,
				...params,
			});
			previousPathname.current = pathname;
		}
	}, [pathname, params]);

	useEffect(() => {
		let active = true;

		void loadAndApplyAppearancePreference({
			isActive: () => active,
			logger,
		});

		return () => {
			active = false;
		};
	}, []);

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
						<AuthenticatedAppSessionProvider
							activationEnabled={shouldActivateAuthenticatedAppSession(
								pathname,
							)}
						>
							<AuthGate pathname={pathname} params={params} />
						</AuthenticatedAppSessionProvider>
						<StatusBar style={isDarkTheme ? "light" : "dark"} />
					</ThemeProvider>
				</ClerkProvider>
			</SafeAreaProvider>
		</PostHogProvider>
	);
}

function shouldActivateAuthenticatedAppSession(pathname: string): boolean {
	return (
		!AUTH_PATHS.has(pathname) && !PUBLIC_AUTH_PRESERVING_PATHS.has(pathname)
	);
}

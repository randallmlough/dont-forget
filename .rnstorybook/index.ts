import "../lib/unistyles/unistyles";

import { ClerkProvider } from "@clerk/clerk-expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerRootComponent } from "expo";
import Constants from "expo-constants";
import { createElement } from "react";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";
import { readAppEnvFromExpoExtra, validateClerkKeyForEnv } from "../lib/env";
import { tokenCache } from "../lib/token-cache";
import { view } from "./storybook.requires";

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

const StorybookUI = view.getStorybookUI({
	storage: {
		getItem: AsyncStorage.getItem,
		setItem: AsyncStorage.setItem,
	},
});

function StorybookUIRoot() {
	return createElement(
		SafeAreaProvider,
		{ initialMetrics: initialWindowMetrics },
		createElement(
			ClerkProvider,
			{ tokenCache, publishableKey },
			createElement(StorybookUI),
		),
	);
}

registerRootComponent(StorybookUIRoot);

export default StorybookUIRoot;

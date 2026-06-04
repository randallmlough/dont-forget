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

const envPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const publishableKey = envPublishableKey ?? "pk_test_storybook";
const appEnv = readAppEnvFromExpoExtra(Constants.expoConfig?.extra);

if (envPublishableKey) {
	validateClerkKeyForEnv(
		appEnv,
		"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
		envPublishableKey,
	);
}

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

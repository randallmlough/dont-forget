import "../src/theme/unistyles";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerRootComponent } from "expo";
import { createElement } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
	initialWindowMetrics,
	SafeAreaProvider,
} from "react-native-safe-area-context";
import { view } from "./storybook.requires";

const StorybookUI = view.getStorybookUI({
	storage: {
		getItem: AsyncStorage.getItem,
		setItem: AsyncStorage.setItem,
	},
});

// Stories with gestures, such as the toast swipe, throw in development without
// a GestureHandlerRootView ancestor.
function StorybookUIRoot() {
	return createElement(
		GestureHandlerRootView,
		null,
		createElement(
			SafeAreaProvider,
			{ initialMetrics: initialWindowMetrics },
			createElement(StorybookUI),
		),
	);
}

registerRootComponent(StorybookUIRoot);

export default StorybookUIRoot;

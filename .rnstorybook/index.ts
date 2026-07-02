import "../src/client/theme/unistyles";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerRootComponent } from "expo";
import { createElement } from "react";
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

function StorybookUIRoot() {
	return createElement(
		SafeAreaProvider,
		{ initialMetrics: initialWindowMetrics },
		createElement(StorybookUI),
	);
}

registerRootComponent(StorybookUIRoot);

export default StorybookUIRoot;

import type { StyleProp, ViewStyle } from "react-native";

import { resetClerkMocks } from "./mocks/clerk";

process.env.APP_ENV ??= "test";
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??= "pk_test_jest";

jest.mock("@clerk/clerk-expo", () => jest.requireActual("./mocks/clerk"));

jest.mock("react-native-reanimated", () => {
	const { View } =
		jest.requireActual<typeof import("react-native")>("react-native");

	return {
		__esModule: true,
		default: { View },
		Easing: {
			cubic: (value: number) => value,
			out: (easing: (value: number) => number) => easing,
		},
		useAnimatedStyle: (updater: () => unknown) => updater(),
		useSharedValue: (value: unknown) => {
			let current = value;

			return {
				get: () => current,
				set: (next: unknown) => {
					current =
						typeof next === "function"
							? (next as (value: unknown) => unknown)(current)
							: next;
				},
			};
		},
		withTiming: (value: unknown) => value,
	};
});

jest.mock("expo-apple-authentication", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { Pressable, Text } =
		jest.requireActual<typeof import("react-native")>("react-native");

	return {
		AppleAuthenticationScope: {
			FULL_NAME: "full_name",
			EMAIL: "email",
		},
		AppleAuthenticationButtonType: {
			SIGN_IN: "sign_in",
		},
		AppleAuthenticationButtonStyle: {
			BLACK: "black",
		},
		AppleAuthenticationButton: ({
			onPress,
			style,
		}: {
			onPress?: () => void;
			style?: StyleProp<ViewStyle>;
		}) =>
			React.createElement(
				Pressable,
				{
					accessibilityLabel: "Continue with Apple",
					accessibilityRole: "button",
					onPress,
					style,
				},
				React.createElement(Text, null, "Continue with Apple"),
			),
		signInAsync: jest.fn(),
	};
});

jest.mock("expo-crypto", () => ({
	randomUUID: jest.fn(() => "test-nonce"),
}));

jest.mock("expo-secure-store", () => ({
	getItemAsync: jest.fn(),
	setItemAsync: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
}));

jest.mock("expo-web-browser", () => ({
	WebBrowserResultType: {
		CANCEL: "cancel",
		DISMISS: "dismiss",
		OPENED: "opened",
		LOCKED: "locked",
	},
	maybeCompleteAuthSession: jest.fn(),
	warmUpAsync: jest.fn(),
	coolDownAsync: jest.fn(),
	openBrowserAsync: jest.fn(),
}));

jest.mock("posthog-react-native", () => {
	const { createMockLogger } =
		jest.requireActual<typeof import("./mocks/logger")>("./mocks/logger");
	const logger = createMockLogger();

	return {
		__esModule: true,
		default: jest.fn(() => ({
			capture: jest.fn(),
			identify: jest.fn(),
			reset: jest.fn(),
			screen: jest.fn(),
			logger,
		})),
		PostHogProvider: ({ children }: { children: unknown }) => children,
	};
});

beforeEach(() => {
	jest.clearAllMocks();
	resetClerkMocks();
});

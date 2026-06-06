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

jest.mock("@expo/ui/swift-ui", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { View } =
		jest.requireActual<typeof import("react-native")>("react-native");

	return {
		BottomSheet: ({
			children,
			isPresented,
		}: {
			children: React.ReactNode;
			isPresented: boolean;
		}) => (isPresented ? React.createElement(View, null, children) : null),
		Group: ({ children }: { children: React.ReactNode }) =>
			React.createElement(View, null, children),
		Host: ({ children }: { children: React.ReactNode }) =>
			React.createElement(View, null, children),
		RNHostView: ({ children }: { children: React.ReactNode }) =>
			React.createElement(View, null, children),
	};
});

jest.mock("@expo/ui/swift-ui/modifiers", () => ({
	interactiveDismissDisabled: jest.fn((isDisabled = true) => ({
		type: "interactiveDismissDisabled",
		isDisabled,
	})),
	presentationDetents: jest.fn((detents) => ({
		type: "presentationDetents",
		detents,
	})),
	presentationDragIndicator: jest.fn((visibility) => ({
		type: "presentationDragIndicator",
		visibility,
	})),
}));

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
	maybeCompleteAuthSession: jest.fn(),
	warmUpAsync: jest.fn(),
	coolDownAsync: jest.fn(),
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

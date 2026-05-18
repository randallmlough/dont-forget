import { resetClerkMocks } from "./mocks/clerk";

process.env.APP_ENV ??= "test";
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??= "pk_test_jest";

jest.mock("@clerk/clerk-expo", () => require("./mocks/clerk"));

jest.mock("expo-apple-authentication", () => {
	const React = require("react");
	const { Pressable, Text } = require("react-native");

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
			style?: unknown;
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
	maybeCompleteAuthSession: jest.fn(),
	warmUpAsync: jest.fn(),
	coolDownAsync: jest.fn(),
}));

jest.mock("posthog-react-native", () => {
	const logger = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	};

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

import {
	background,
	containerRelativeFrame,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import { render, screen } from "@testing-library/react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Text, View } from "react-native";
import { lightTheme } from "@/lib/unistyles/unistyles";
import { BottomSheet } from "./bottom-sheet";

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
			onIsPresentedChange: (isPresented: boolean) => void;
		}) =>
			isPresented
				? React.createElement(
						View,
						{ accessibilityLabel: "Shared bottom sheet" },
						children,
					)
				: null,
		Group: ({
			children,
		}: {
			children: React.ReactNode;
			modifiers?: unknown[];
		}) => React.createElement(React.Fragment, null, children),
		RNHostView: ({
			children,
			style,
		}: {
			children: React.ReactNode;
			style?: StyleProp<ViewStyle>;
		}) => React.createElement(View, { style }, children),
	};
});

jest.mock("@expo/ui/swift-ui/modifiers", () => ({
	background: jest.fn(() => ({ type: "background" })),
	containerRelativeFrame: jest.fn(() => ({ type: "containerRelativeFrame" })),
	presentationDetents: jest.fn(() => ({ type: "presentationDetents" })),
	presentationDragIndicator: jest.fn(() => ({
		type: "presentationDragIndicator",
	})),
}));

beforeEach(() => {
	jest.clearAllMocks();
});

it("renders React Native content inside the shared native bottom sheet styling", () => {
	render(
		<BottomSheet isPresented onIsPresentedChange={jest.fn()}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	expect(screen.getByLabelText("Shared bottom sheet")).toBeTruthy();
	expect(screen.getByText("Sheet content")).toBeTruthy();
	expect(presentationDetents).toHaveBeenCalledWith(["medium", "large"]);
	expect(presentationDragIndicator).toHaveBeenCalledWith("visible");
	expect(containerRelativeFrame).toHaveBeenCalledWith({
		axes: "vertical",
		alignment: "top",
	});
	expect(background).toHaveBeenCalledWith(lightTheme.colors.background);
});

it("does not render content when the sheet is dismissed", () => {
	render(
		<BottomSheet isPresented={false} onIsPresentedChange={jest.fn()}>
			<View>
				<Text>Sheet content</Text>
			</View>
		</BottomSheet>,
	);

	expect(screen.queryByText("Sheet content")).toBeNull();
});

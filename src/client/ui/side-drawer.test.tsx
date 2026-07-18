import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SideDrawer } from "./side-drawer";

describe("SideDrawer", () => {
	it("renders children while open", async () => {
		await render(
			<SideDrawer isOpen onClose={jest.fn()}>
				<View>
					<Text>Drawer content</Text>
				</View>
			</SideDrawer>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(screen.getByText("Drawer content")).toBeTruthy();
	});

	it("closes when the scrim is pressed", async () => {
		const onClose = jest.fn();
		await render(
			<SideDrawer isOpen onClose={onClose}>
				<View>
					<Text>Drawer content</Text>
				</View>
			</SideDrawer>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent.press(
			screen.getByRole("button", { name: "Close navigation" }),
		);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("reports when the native Modal finishes dismissing", async () => {
		const onDismissed = jest.fn();
		await render(
			<SideDrawer
				isOpen
				onClose={jest.fn()}
				onDismissed={onDismissed}
				testID="side-drawer-modal"
			>
				<View>
					<Text>Drawer content</Text>
				</View>
			</SideDrawer>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent(screen.getByTestId("side-drawer-modal"), "dismiss");

		expect(onDismissed).toHaveBeenCalledTimes(1);
	});
});

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, left: 0, right: 0, bottom: 34 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

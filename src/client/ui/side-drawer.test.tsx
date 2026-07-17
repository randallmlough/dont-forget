import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { SideDrawer } from "./side-drawer";

describe("SideDrawer", () => {
	it("renders children while open", async () => {
		await render(
			<SideDrawer isOpen onClose={jest.fn()}>
				<View>
					<Text>Drawer content</Text>
				</View>
			</SideDrawer>,
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
		);

		await fireEvent(screen.getByTestId("side-drawer-modal"), "dismiss");

		expect(onDismissed).toHaveBeenCalledTimes(1);
	});
});

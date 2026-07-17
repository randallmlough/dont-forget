import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HomeNavigationDrawer } from "./home-navigation-drawer";

describe("HomeNavigationDrawer", () => {
	it("waits for modal dismissal before opening a destination", async () => {
		const onClose = jest.fn();
		const onOpenSettings = jest.fn();
		await render(
			<HomeNavigationDrawer
				isOpen
				memberName="Avery Chen"
				householdName="Juniper House"
				onClose={onClose}
				onOpenAllLists={jest.fn()}
				onOpenHousehold={jest.fn()}
				onOpenSettings={onOpenSettings}
				onSwitchHousehold={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent.press(screen.getByRole("button", { name: "Settings" }));

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(onOpenSettings).not.toHaveBeenCalled();

		await fireEvent(
			screen.getByTestId("home-navigation-drawer-modal"),
			"dismiss",
		);

		expect(onOpenSettings).toHaveBeenCalledTimes(1);
	});
});

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 0, left: 0, right: 0, bottom: 24 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

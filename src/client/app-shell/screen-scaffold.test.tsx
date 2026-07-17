import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "./navigation-drawer-context";
import { ScreenScaffold } from "./screen-scaffold";

it("opens navigation and renders the screen heading", async () => {
	const open = jest.fn();
	await render(
		<NavigationDrawerProvider open={open}>
			<ScreenScaffold label="Settings" title="App settings">
				<Text>Screen content</Text>
			</ScreenScaffold>
		</NavigationDrawerProvider>,
		{ wrapper: TestSafeAreaProvider },
	);

	expect(screen.getByText("Settings")).toBeTruthy();
	expect(screen.getByText("App settings")).toBeTruthy();
	expect(screen.getByText("Screen content")).toBeTruthy();

	await fireEvent.press(screen.getByRole("button", { name: "Open navigation" }));

	expect(open).toHaveBeenCalledTimes(1);
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

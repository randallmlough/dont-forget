import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import meta, { NavigationDrawerStory } from "./navigation-drawer.stories";

jest.mock("expo-router", () => ({
	usePathname: () => "/",
	useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);

jest.mock("@/client/session", () => ({}));

describe("NavigationDrawer stories", () => {
	it("lets the user dismiss and reopen the drawer", async () => {
		await render(<NavigationDrawerStory {...meta.args} />, {
			wrapper: TestSafeAreaProvider,
		});

		expect(screen.getByTestId("navigation-drawer-modal").props.visible).toBe(
			true,
		);

		await fireEvent.press(
			screen.getByRole("button", { name: "Close navigation" }),
		);

		expect(screen.queryByTestId("navigation-drawer-modal")).toBeNull();

		await fireEvent.press(
			screen.getByRole("button", { name: "Open navigation" }),
		);

		expect(screen.getByTestId("navigation-drawer-modal").props.visible).toBe(
			true,
		);
	});
});

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 1024, height: 1366 },
				insets: { top: 24, left: 0, right: 0, bottom: 20 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import * as mockReactNative from "react-native";

import AppLayout from "@/app/(app)/_layout";

jest.mock("expo-router", () => ({
	Stack: () => <mockReactNative.Text>Signed-in stack</mockReactNative.Text>,
}));

jest.mock("@/components/session", () => ({
	AuthenticatedAppSessionProvider({ children }: PropsWithChildren) {
		return (
			<mockReactNative.View testID="authenticated-app-session-provider">
				{children}
			</mockReactNative.View>
		);
	},
}));

describe("AppLayout", () => {
	it("wraps signed-in routes with the Authenticated App Session provider", () => {
		render(<AppLayout />);

		expect(
			screen.getByTestId("authenticated-app-session-provider"),
		).toBeTruthy();
		expect(screen.getByText("Signed-in stack")).toBeTruthy();
	});
});

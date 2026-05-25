import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import * as mockReactNative from "react-native";

import AppLayout from "@/app/(app)/_layout";

jest.mock("expo-router", () => ({
	Stack: () => <mockReactNative.Text>Signed-in stack</mockReactNative.Text>,
}));

jest.mock("@/components/active-household", () => ({
	ActiveHouseholdProvider({ children }: PropsWithChildren) {
		return (
			<mockReactNative.View testID="active-household-provider">
				{children}
			</mockReactNative.View>
		);
	},
}));

describe("AppLayout", () => {
	it("wraps signed-in routes with the Active Household provider", () => {
		render(<AppLayout />);

		expect(screen.getByTestId("active-household-provider")).toBeTruthy();
		expect(screen.getByText("Signed-in stack")).toBeTruthy();
	});
});

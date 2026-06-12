import { render, screen } from "@testing-library/react-native";
import * as mockReactNative from "react-native";

import AppLayout from "@/app/(app)/_layout";

jest.mock("expo-router", () => ({
	Stack: () => <mockReactNative.Text>Signed-in stack</mockReactNative.Text>,
}));

describe("AppLayout", () => {
	it("renders signed-in routes", async () => {
		await render(<AppLayout />);

		expect(screen.getByText("Signed-in stack")).toBeTruthy();
	});
});

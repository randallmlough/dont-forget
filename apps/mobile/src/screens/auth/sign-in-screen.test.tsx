import SignInScreen from "@mobile/screens/auth/sign-in-screen";
import { analyticsMocks } from "@mobile/test/mocks/analytics";
import { clerkMocks } from "@mobile/test/mocks/clerk";
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("@mobile/lib/analytics", () =>
	jest.requireActual("@mobile/test/mocks/analytics"),
);

jest.mock("expo-router", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { Text } =
		jest.requireActual<typeof import("react-native")>("react-native");

	return {
		Link: ({ children }: { children: React.ReactNode }) =>
			React.createElement(Text, null, children),
		useLocalSearchParams: () => ({}),
	};
});

describe("SignInScreen", () => {
	it("signs in with email, tracks the event, and activates the Clerk session", async () => {
		jest.spyOn(Alert, "alert").mockImplementation(() => {});
		clerkMocks.signInCreate.mockResolvedValue({
			createdSessionId: "session_123",
		});

		await render(<SignInScreen />);

		await fireEvent.changeText(
			screen.getByPlaceholderText("Email"),
			" member@example.com ",
		);
		await fireEvent.changeText(
			screen.getByPlaceholderText("Password"),
			"correct horse battery staple",
		);
		await fireEvent.press(screen.getByText("Sign in"));

		await waitFor(() => {
			expect(clerkMocks.signInCreate).toHaveBeenCalledWith({
				identifier: "member@example.com",
				password: "correct horse battery staple",
			});
		});

		expect(analyticsMocks.track).toHaveBeenCalledWith("user_signed_in", {
			method: "email",
		});
		expect(clerkMocks.setActive).toHaveBeenCalledWith({
			session: "session_123",
		});
		expect(Alert.alert).not.toHaveBeenCalled();
	});
});

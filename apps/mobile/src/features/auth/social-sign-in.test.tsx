import { SocialSignIn } from "@mobile/features/auth/social-sign-in";
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { Alert } from "react-native";

jest.mock("@mobile/lib/analytics", () =>
	jest.requireActual("@mobile/test/mocks/analytics"),
);

describe("SocialSignIn", () => {
	it("silently returns when the native Apple authorization is canceled", async () => {
		jest
			.mocked(AppleAuthentication.signInAsync)
			.mockRejectedValue(
				new Error("The user canceled the authorization attempt"),
			);
		jest.spyOn(Alert, "alert").mockImplementation(() => {});

		await render(<SocialSignIn />);
		fireEvent.press(
			screen.getByRole("button", { name: "Continue with Apple" }),
		);

		await waitFor(() => {
			expect(AppleAuthentication.signInAsync).toHaveBeenCalledTimes(1);
		});
		expect(Alert.alert).not.toHaveBeenCalled();
	});
});

import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import { analyticsMocks } from "@/lib/test/mocks/analytics";
import { clerkMocks } from "@/lib/test/mocks/clerk";
import SignUpScreen from "@/screens/auth/sign-up-screen";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
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

function fillCreateAccountForm({
	email = " member@example.com ",
	password = "correct horse battery staple",
	confirm = password,
}: {
	email?: string;
	password?: string;
	confirm?: string;
} = {}) {
	fireEvent.changeText(screen.getByPlaceholderText("Email"), email);
	fireEvent.changeText(
		screen.getByPlaceholderText("Password (8+ characters)"),
		password,
	);
	fireEvent.changeText(
		screen.getByPlaceholderText("Confirm password"),
		confirm,
	);
}

async function moveToVerification() {
	clerkMocks.signUpCreate.mockResolvedValue({ createdSessionId: null });
	render(<SignUpScreen />);

	fillCreateAccountForm();
	fireEvent.press(screen.getByText("Create account"));

	await waitFor(() => {
		expect(clerkMocks.prepareEmailAddressVerification).toHaveBeenCalledWith({
			strategy: "email_code",
		});
	});
}

describe("SignUpScreen", () => {
	beforeEach(() => {
		jest.spyOn(Alert, "alert").mockImplementation(() => {});
	});

	it("signs up with email, tracks the event, and activates the Clerk session", async () => {
		clerkMocks.signUpCreate.mockResolvedValue({
			createdSessionId: "session_1",
		});

		render(<SignUpScreen />);

		fillCreateAccountForm();
		fireEvent.press(screen.getByText("Create account"));

		await waitFor(() => {
			expect(clerkMocks.signUpCreate).toHaveBeenCalledWith({
				emailAddress: "member@example.com",
				password: "correct horse battery staple",
			});
		});

		expect(analyticsMocks.track).toHaveBeenCalledWith("user_signed_up", {
			method: "email",
		});
		expect(clerkMocks.setActive).toHaveBeenCalledWith({ session: "session_1" });
		expect(Alert.alert).not.toHaveBeenCalled();
	});

	it("starts email verification when Clerk does not create a session immediately", async () => {
		clerkMocks.signUpCreate.mockResolvedValue({ createdSessionId: null });

		render(<SignUpScreen />);

		fillCreateAccountForm();
		fireEvent.press(screen.getByText("Create account"));

		await waitFor(() => {
			expect(clerkMocks.prepareEmailAddressVerification).toHaveBeenCalledWith({
				strategy: "email_code",
			});
		});

		expect(analyticsMocks.track).toHaveBeenCalledWith("user_signed_up", {
			method: "email",
		});
		expect(
			screen.getByText("We sent a verification code to member@example.com."),
		).toBeTruthy();
		expect(screen.getByPlaceholderText("Verification code")).toBeTruthy();
		expect(Alert.alert).not.toHaveBeenCalled();
	});

	it("alerts when email or password is missing", () => {
		render(<SignUpScreen />);

		fireEvent.press(screen.getByText("Create account"));

		expect(Alert.alert).toHaveBeenCalledWith(
			"Missing info",
			"Enter your email and a password.",
		);
		expect(clerkMocks.signUpCreate).not.toHaveBeenCalled();
	});

	it("alerts when password confirmation does not match", () => {
		render(<SignUpScreen />);

		fillCreateAccountForm({ confirm: "different password" });
		fireEvent.press(screen.getByText("Create account"));

		expect(Alert.alert).toHaveBeenCalledWith(
			"Passwords don't match",
			"Re-enter your password to confirm.",
		);
		expect(clerkMocks.signUpCreate).not.toHaveBeenCalled();
	});

	it("alerts when Clerk rejects sign-up creation", async () => {
		clerkMocks.signUpCreate.mockRejectedValue(new Error("Email is invalid."));

		render(<SignUpScreen />);

		fillCreateAccountForm();
		fireEvent.press(screen.getByText("Create account"));

		await waitFor(() => {
			expect(Alert.alert).toHaveBeenCalledWith(
				"Sign up failed",
				"Email is invalid.",
			);
		});
	});

	it("verifies email, tracks the event, and activates the Clerk session", async () => {
		await moveToVerification();
		clerkMocks.attemptEmailAddressVerification.mockResolvedValue({
			createdSessionId: "session_2",
		});

		fireEvent.changeText(
			screen.getByPlaceholderText("Verification code"),
			" 123456 ",
		);
		fireEvent.press(screen.getByText("Verify email"));

		await waitFor(() => {
			expect(clerkMocks.attemptEmailAddressVerification).toHaveBeenCalledWith({
				code: "123456",
			});
		});

		expect(analyticsMocks.track).toHaveBeenCalledWith(
			"user_email_verified",
			{},
		);
		expect(clerkMocks.setActive).toHaveBeenCalledWith({ session: "session_2" });
		expect(Alert.alert).not.toHaveBeenCalled();
	});

	it("alerts when verification does not create a session", async () => {
		await moveToVerification();
		clerkMocks.attemptEmailAddressVerification.mockResolvedValue({
			createdSessionId: null,
		});

		fireEvent.changeText(
			screen.getByPlaceholderText("Verification code"),
			"123456",
		);
		fireEvent.press(screen.getByText("Verify email"));

		await waitFor(() => {
			expect(Alert.alert).toHaveBeenCalledWith(
				"Verification incomplete",
				"Please try again.",
			);
		});
	});

	it("alerts when Clerk rejects email verification", async () => {
		await moveToVerification();
		clerkMocks.attemptEmailAddressVerification.mockRejectedValue(
			new Error("Code expired."),
		);

		fireEvent.changeText(
			screen.getByPlaceholderText("Verification code"),
			"123456",
		);
		fireEvent.press(screen.getByText("Verify email"));

		await waitFor(() => {
			expect(Alert.alert).toHaveBeenCalledWith(
				"Verification failed",
				"Code expired.",
			);
		});
	});

	it("returns to the create-account form from email verification", async () => {
		await moveToVerification();

		fireEvent.press(screen.getByText("Use a different email"));

		expect(screen.getByPlaceholderText("Email")).toBeTruthy();
		expect(
			screen.getByPlaceholderText("Password (8+ characters)"),
		).toBeTruthy();
		expect(screen.getByPlaceholderText("Confirm password")).toBeTruthy();
	});
});

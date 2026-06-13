import {
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react-native";
import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { createUsersApiClient } from "@/lib/client-api/users";
import OnboardingScreen from "./onboarding-screen";

const mockReplace = jest.fn();
const mockCompleteOnboarding = jest.fn(async () => undefined);
const mockMarkOnboardingComplete = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
	useAuth: () => ({ getToken: async () => "token" }),
}));

jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/lib/client-api/users", () => ({
	createUsersApiClient: jest.fn(() => ({
		completeOnboarding: mockCompleteOnboarding,
	})),
}));

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

beforeEach(() => {
	mockReplace.mockReset();
	mockCompleteOnboarding.mockReset();
	mockCompleteOnboarding.mockResolvedValue(undefined);
	mockMarkOnboardingComplete.mockReset();
	jest.mocked(track).mockClear();
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: null,
		markOnboardingComplete: mockMarkOnboardingComplete,
		retry() {},
		reloadSession() {},
		signOut: async () => undefined,
	});
	jest.mocked(createUsersApiClient).mockClear();
});

describe("OnboardingScreen", () => {
	it("renders the first onboarding step", async () => {
		await render(<OnboardingScreen />);

		expect(screen.getByText("Welcome to Don't Forget")).toBeTruthy();
		expect(screen.getByText("Step 1 of 3")).toBeTruthy();
	});

	it("advances to the next step", async () => {
		await render(<OnboardingScreen />);

		await fireEvent.press(screen.getByText("Next"));

		expect(screen.getByText("Share your Household")).toBeTruthy();
		expect(screen.getByText("Step 2 of 3")).toBeTruthy();
	});

	it("skips onboarding, completes best effort, and navigates Home", async () => {
		await render(<OnboardingScreen />);

		const footerActions = screen.getByTestId("onboarding-footer-actions");

		await fireEvent.press(within(footerActions).getByText("Skip"));

		expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
		expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
		expect(track).toHaveBeenCalledWith("onboarding_completed", {
			skipped: true,
			last_step: "welcome",
		});
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("keeps Skip in the footer action row", async () => {
		await render(<OnboardingScreen />);

		const footerActions = screen.getByTestId("onboarding-footer-actions");

		expect(within(footerActions).getByText("Skip")).toBeTruthy();
	});

	it("finishes onboarding from the final step", async () => {
		await render(<OnboardingScreen />);

		await fireEvent.press(screen.getByText("Next"));
		await fireEvent.press(screen.getByText("Next"));
		await fireEvent.press(screen.getByText("Done"));

		expect(mockMarkOnboardingComplete).toHaveBeenCalledTimes(1);
		expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
		expect(track).toHaveBeenCalledWith("onboarding_completed", {
			skipped: false,
			last_step: "done",
		});
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("still navigates Home when completion fails", async () => {
		mockCompleteOnboarding.mockRejectedValueOnce(new Error("offline"));
		await render(<OnboardingScreen />);

		await fireEvent.press(screen.getByText("Skip"));

		expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});
});

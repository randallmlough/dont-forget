import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import { useAuthenticatedAppSession } from "@/components/session";
import { track } from "@/lib/analytics";
import { createUsersApiClient } from "@/lib/client-api/users";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { deferred } from "@/lib/test/async";
import OnboardingScreen from "./onboarding-screen";

const mockReplace = jest.fn();
const mockCompleteOnboarding = jest.fn(async () => undefined);
const mockReloadSessionAndWait = jest.fn<
	Promise<AuthenticatedAppSession | null>,
	[]
>(async () => sessionFixture({ onboardingCompletedAt: 1 }));

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
	mockReloadSessionAndWait.mockReset();
	mockReloadSessionAndWait.mockResolvedValue(
		sessionFixture({ onboardingCompletedAt: 1 }),
	);
	jest.mocked(track).mockClear();
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: sessionFixture(),
		retry() {},
		reloadSession() {},
		reloadSessionAndWait: mockReloadSessionAndWait,
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

	it("skips onboarding, completes persistence, tracks completion, and navigates Home", async () => {
		const durableReload = deferred<AuthenticatedAppSession | null>();
		mockReloadSessionAndWait.mockReturnValueOnce(durableReload.promise);
		await render(<OnboardingScreen />);

		const footerActions = screen.getByTestId("onboarding-footer-actions");

		fireEvent.press(within(footerActions).getByText("Skip"));

		await waitFor(() =>
			expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1),
		);
		expect(mockReloadSessionAndWait).toHaveBeenCalledWith({
			mode: "retireCurrent",
		});
		expect(track).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();

		durableReload.resolve(sessionFixture({ onboardingCompletedAt: 1 }));

		await waitFor(() =>
			expect(track).toHaveBeenCalledWith("onboarding_completed", {
				skipped: true,
				last_step: "welcome",
			}),
		);
		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
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

		await waitFor(() =>
			expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1),
		);
		await waitFor(() =>
			expect(track).toHaveBeenCalledWith("onboarding_completed", {
				skipped: false,
				last_step: "done",
			}),
		);
		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
	});

	it("stays on onboarding when completion fails", async () => {
		mockCompleteOnboarding.mockRejectedValueOnce(new Error("offline"));
		await render(<OnboardingScreen />);

		await fireEvent.press(screen.getByText("Skip"));

		await waitFor(() =>
			expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1),
		);
		expect(track).not.toHaveBeenCalledWith("onboarding_completed", {
			skipped: true,
			last_step: "welcome",
		});
		expect(mockReplace).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(
				screen.getByText("Unable to finish onboarding. Please try again."),
			).toBeTruthy(),
		);
	});

	it("stays on onboarding when durable reload does not confirm completion", async () => {
		mockReloadSessionAndWait.mockResolvedValueOnce(sessionFixture());
		await render(<OnboardingScreen />);

		await fireEvent.press(screen.getByText("Skip"));

		await waitFor(() =>
			expect(mockReloadSessionAndWait).toHaveBeenCalledWith({
				mode: "retireCurrent",
			}),
		);
		expect(track).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(
				screen.getByText("Unable to finish onboarding. Please try again."),
			).toBeTruthy(),
		);
	});

	it("does not complete while the Authenticated App Session is unavailable", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			retry() {},
			reloadSession() {},
			reloadSessionAndWait: mockReloadSessionAndWait,
			signOut: async () => undefined,
		});
		await render(<OnboardingScreen />);

		const footerActions = screen.getByTestId("onboarding-footer-actions");

		await fireEvent.press(within(footerActions).getByText("Skip"));

		expect(mockCompleteOnboarding).not.toHaveBeenCalled();
		expect(track).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
	});
});

function sessionFixture({
	onboardingCompletedAt = null,
}: {
	onboardingCompletedAt?: number | null;
} = {}): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: null,
			onboardingCompletedAt,
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery",
		},
		members: [],
		resourceKey: "resource",
		services: {
			lists: {
				createList: unusedSessionServiceCall,
				getList: unusedSessionServiceCall,
				renameList: unusedSessionServiceCall,
				deleteList: unusedSessionServiceCall,
				listLists: unusedSessionServiceCall,
			},
			items: {
				listItems: unusedSessionServiceCall,
				addItem: unusedSessionServiceCall,
				setItemChecked: unusedSessionServiceCall,
			},
			changes: { subscribe: () => ({ remove() {} }) },
			sync: {
				getStatus: () => "synced",
				subscribe: () => ({ remove() {} }),
				requestSync: async () => null,
			},
		},
	};
}

async function unusedSessionServiceCall(): Promise<never> {
	throw new Error("OnboardingScreen test does not use session services");
}

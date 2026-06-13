import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import {
	type AuthenticatedAppSessionContextValue,
	useAuthenticatedAppSession,
} from "@/components/session";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { hasCachedAuthenticatedAppSession } from "@/lib/services/session";
import { setMockAuthState } from "@/lib/test/mocks/clerk";

const mockReplace = jest.fn();

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/services/session", () => ({
	hasCachedAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("expo-router", () => {
	const React = jest.requireActual<typeof import("react")>("react");
	const { View } =
		jest.requireActual<typeof import("react-native")>("react-native");

	function Stack({ children }: { children?: ReactNode }) {
		return React.createElement(View, null, children);
	}

	Stack.Screen = function Screen() {
		return null;
	};

	return {
		Stack,
		useGlobalSearchParams: () => ({}),
		usePathname: () => "/",
		useRouter: () => ({ replace: mockReplace }),
	};
});

beforeEach(() => {
	mockReplace.mockReset();
	jest.mocked(hasCachedAuthenticatedAppSession).mockResolvedValue(false);
	jest
		.mocked(useAuthenticatedAppSession)
		.mockReturnValue(sessionContextFixture());
});

describe("AuthGate", () => {
	it("keeps Home mounted while auth is unknown and a cached Household session exists", async () => {
		jest.mocked(hasCachedAuthenticatedAppSession).mockResolvedValue(true);
		setMockAuthState({ isLoaded: false, isSignedIn: false });

		await render(<AuthGate pathname="/" />);

		await waitFor(() =>
			expect(hasCachedAuthenticatedAppSession).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
	});

	it("redirects to sign-in when Clerk reports signed out even if a cached Household session exists", async () => {
		jest.mocked(hasCachedAuthenticatedAppSession).mockResolvedValue(true);
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(<AuthGate pathname="/" />);

		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
		expect(hasCachedAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("redirects to sign-in when there is no Clerk session or cached Household session", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(<AuthGate pathname="/" />);

		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
	});

	it("keeps public routes reachable while signed in", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: true });

		await render(
			<AuthGate
				pathname="/invitations/accept"
				params={{ token: "token-123" }}
			/>,
		);

		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("keeps public routes reachable while signed out", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(
			<AuthGate pathname="/households/join" params={{ code: "ABCDEFGH" }} />,
		);

		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("redirects signed-in auth routes to safe internal route intent", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: true });

		await render(
			<AuthGate pathname="/sign-in" params={{ next: "/household/settings" }} />,
		);

		await waitFor(() =>
			expect(mockReplace).toHaveBeenCalledWith("/household/settings"),
		);
	});

	it("redirects a signed-in User from Home to onboarding when the Authenticated App Session is incomplete", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: true });
		jest
			.mocked(useAuthenticatedAppSession)
			.mockReturnValue(sessionContextFixture({ onboardingCompletedAt: null }));

		await render(<AuthGate pathname="/" />);

		await waitFor(() =>
			expect(mockReplace).toHaveBeenCalledWith("/onboarding"),
		);
	});

	it("redirects signed-in auth routes to preserved public route intent", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: true });

		await render(
			<AuthGate
				pathname="/sign-in"
				params={{ next: "/invitations/accept", token: "token-123" }}
			/>,
		);

		await waitFor(() =>
			expect(mockReplace).toHaveBeenCalledWith(
				"/invitations/accept?token=token-123",
			),
		);
	});
});

function sessionContextFixture(
	options: { onboardingCompletedAt?: number | null } = {},
): AuthenticatedAppSessionContextValue {
	return {
		state: { status: "ready", refreshing: false },
		session: sessionFixture(options),
		markOnboardingComplete() {},
		retry() {},
		reloadSession() {},
		signOut: async () => undefined,
	};
}

function sessionFixture({
	onboardingCompletedAt = 1_700_000_000_000,
}: {
	onboardingCompletedAt?: number | null;
} = {}): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
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
		services: unusedSessionServices(),
	};
}

function unusedSessionServices(): AuthenticatedAppSession["services"] {
	const unusedServiceCall = async () => {
		throw new Error("AuthGate test does not use session services");
	};

	return {
		lists: {
			createList: unusedServiceCall,
			getList: unusedServiceCall,
			renameList: unusedServiceCall,
			deleteList: unusedServiceCall,
			listLists: unusedServiceCall,
		},
		items: {
			listItems: unusedServiceCall,
			addItem: unusedServiceCall,
			setItemChecked: unusedServiceCall,
		},
		changes: { subscribe: () => ({ remove() {} }) },
		sync: {
			getStatus: () => "synced",
			subscribe: () => ({ remove() {} }),
			requestSync: async () => null,
		},
	};
}

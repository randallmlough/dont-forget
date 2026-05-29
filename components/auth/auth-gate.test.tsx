import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { hasCachedAuthenticatedAppSession } from "@/lib/services/session";
import { setMockAuthState } from "@/lib/test/mocks/clerk";

const mockReplace = jest.fn();

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/services/session", () => ({
	hasCachedAuthenticatedAppSession: jest.fn(),
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
});

describe("AuthGate", () => {
	it("keeps Home mounted while auth is unknown and a cached Household session exists", async () => {
		jest.mocked(hasCachedAuthenticatedAppSession).mockResolvedValue(true);
		setMockAuthState({ isLoaded: false, isSignedIn: false });

		render(<AuthGate pathname="/" />);

		await waitFor(() =>
			expect(hasCachedAuthenticatedAppSession).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
	});

	it("redirects to sign-in when Clerk reports signed out even if a cached Household session exists", async () => {
		jest.mocked(hasCachedAuthenticatedAppSession).mockResolvedValue(true);
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		render(<AuthGate pathname="/" />);

		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
		expect(hasCachedAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("redirects to sign-in when there is no Clerk session or cached Household session", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		render(<AuthGate pathname="/" />);

		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
	});
});

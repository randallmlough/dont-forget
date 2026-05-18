import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { readCachedBootstrapMetadata } from "@/lib/app/offline-bootstrap-cache";
import { setMockAuthState } from "@/lib/test/mocks/clerk";

const mockReplace = jest.fn();

jest.mock("@/lib/analytics", () => ({
	useAnalyticsIdentity: jest.fn(),
}));

jest.mock("@/lib/app/offline-bootstrap-cache", () => ({
	readCachedBootstrapMetadata: jest.fn(),
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
	jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(null);
});

describe("AuthGate", () => {
	it("keeps Home mounted when Clerk reports signed out but a cached Household session exists", async () => {
		jest
			.mocked(readCachedBootstrapMetadata)
			.mockResolvedValue(cachedBootstrapFixture());
		setMockAuthState({ isSignedIn: false });

		render(<AuthGate pathname="/" />);

		await waitFor(() =>
			expect(readCachedBootstrapMetadata).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
	});

	it("redirects to sign-in when there is no Clerk session or cached Household session", async () => {
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		render(<AuthGate pathname="/" />);

		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
	});
});

function cachedBootstrapFixture() {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner" as const,
			displayName: "Avery Chen",
		},
		activeList: { id: "lst_default_groceries", name: "Groceries" },
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner" as const,
				displayName: "Avery Chen",
			},
		],
		householdDatabase: {
			url: "libsql://example.turso.io",
			expiresAt: 1,
		},
		initializedAt: 1_700_000_000_000,
	};
}

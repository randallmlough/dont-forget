import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { hasAuthenticatedAppSessionHint } from "@/lib/services/session/session-hint";
import { setMockAuthState } from "@/lib/test/mocks/clerk";

const mockReplace = jest.fn();

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

jest.mock("@/lib/services/session/session-hint", () => ({
	hasAuthenticatedAppSessionHint: jest.fn(),
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
	jest.mocked(hasAuthenticatedAppSessionHint).mockResolvedValue(false);
});

describe("AuthGate", () => {
	it("keeps Home mounted while auth is unknown and a persisted signed-in hint exists", async () => {
		jest.mocked(hasAuthenticatedAppSessionHint).mockResolvedValue(true);
		setMockAuthState({ isLoaded: false, isSignedIn: false });

		await render(<AuthGate pathname="/" />);

		await waitFor(() =>
			expect(hasAuthenticatedAppSessionHint).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
	});

	it("redirects to sign-in when Clerk reports signed out even if a persisted signed-in hint exists", async () => {
		jest.mocked(hasAuthenticatedAppSessionHint).mockResolvedValue(true);
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(<AuthGate pathname="/" />);

		await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/sign-in"));
		expect(hasAuthenticatedAppSessionHint).not.toHaveBeenCalled();
	});

	it("redirects to sign-in when there is no Clerk session or persisted hint", async () => {
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

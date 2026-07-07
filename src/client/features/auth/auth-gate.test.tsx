import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AuthGate } from "@/client/features/auth/auth-gate";
import { useAuthenticatedAppSessionMeta } from "@/client/session";
import { hasAuthenticatedAppSessionHint } from "@/client/session/session-hint";
import { setMockAuthState } from "@/test/mocks/clerk";

const mockReplace = jest.fn();

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);

jest.mock("@/client/session/session-hint", () => ({
	hasAuthenticatedAppSessionHint: jest.fn(),
}));

jest.mock("@/client/session", () => ({
	useAuthenticatedAppSessionMeta: jest.fn(() => ({
		restore: { status: "idle" },
	})),
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
	jest.mocked(useAuthenticatedAppSessionMeta).mockReturnValue({
		restore: { status: "idle" },
	});
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

	it("keeps Home mounted when Clerk reports signed out and a persisted session exists", async () => {
		jest.mocked(hasAuthenticatedAppSessionHint).mockResolvedValue(true);
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(<AuthGate pathname="/" />);

		await waitFor(() =>
			expect(hasAuthenticatedAppSessionHint).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalledWith("/sign-in");
	});

	it("keeps sign-in reachable after cached restore failed", async () => {
		jest.mocked(hasAuthenticatedAppSessionHint).mockResolvedValue(true);
		jest.mocked(useAuthenticatedAppSessionMeta).mockReturnValue({
			restore: { status: "failed" },
		});
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(<AuthGate pathname="/sign-in" />);

		await waitFor(() =>
			expect(hasAuthenticatedAppSessionHint).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("keeps sign-in reachable after mid-run auth loss", async () => {
		jest.mocked(hasAuthenticatedAppSessionHint).mockResolvedValue(true);
		jest.mocked(useAuthenticatedAppSessionMeta).mockReturnValue({
			restore: { status: "signInRequired" },
		});
		setMockAuthState({ isLoaded: true, isSignedIn: false });

		await render(<AuthGate pathname="/sign-in" />);

		await waitFor(() =>
			expect(hasAuthenticatedAppSessionHint).toHaveBeenCalledTimes(1),
		);
		expect(mockReplace).not.toHaveBeenCalled();
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

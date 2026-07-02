import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { useLogger } from "@/client/lib/logger";
import type { SessionBootstrapService } from "@/client/session/bootstrap";
import { deferred } from "@/test/async";
import { createMockAnalytics } from "@/test/mocks/analytics";
import { createMockLogger, type MockLogger } from "@/test/mocks/logger";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionConnectDatabase,
	AuthenticatedAppSessionProvider,
	type AuthenticatedAppSessionProviderAuth,
	useAuthenticatedAppSession,
} from "./provider";
import { markAuthenticatedAppSessionPresent } from "./session-hint";

let mockLogger: MockLogger;

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);

jest.mock("./session-hint", () => ({
	clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
	markAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
}));

describe("AuthenticatedAppSessionProvider", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLogger = createMockLogger();
		mockLogger.with.mockReturnValue(mockLogger);
		jest.mocked(useLogger).mockReturnValue(mockLogger);
	});

	it("bootstraps, connects PowerSync, and renders ready state", async () => {
		const session = appSessionFixture();
		const bootstrapService = bootstrapServiceFixture(session);
		const connectDatabase = connectDatabaseFixture();
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());
		expect(screen.getByText("hh_avery")).toBeTruthy();
		expect(screen.getByText("ready")).toBeTruthy();
		expect(bootstrapService.getSession).toHaveBeenCalledWith(
			expect.any(Function),
		);
		expect(connectDatabase).toHaveBeenCalledWith({
			getToken: expect.any(Function),
			getPowerSyncToken: expect.any(Function),
		});
		const getSessionToken = bootstrapService.getSession.mock.calls[0]?.[0];
		const connectInput = connectDatabase.mock.calls[0]?.[0];
		await expect(getSessionToken?.()).resolves.toBe("token");
		await expect(connectInput?.getToken()).resolves.toBe("token");
		await expect(connectInput?.getPowerSyncToken()).resolves.toBe(
			"powersync-token",
		);
		expect(markAuthenticatedAppSessionPresent).toHaveBeenCalledTimes(1);
	});

	it("can defer initial activation until reload is requested", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				activationEnabled={false}
			>
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);

		await Promise.resolve();
		expect(bootstrapService.getSession).not.toHaveBeenCalled();

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() =>
			expect(bootstrapService.getSession).toHaveBeenCalledTimes(1),
		);
	});

	it("does not reactivate when only the token callback identity changes", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const firstAuth = authFixture();
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				auth={firstAuth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(bootstrapService.getSession).toHaveBeenCalledTimes(1),
		);

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={authFixture({
					getToken: jest.fn(async () => "next-token"),
				})}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await Promise.resolve();
		expect(bootstrapService.getSession).toHaveBeenCalledTimes(1);
	});

	it("keeps the previous session while a replacement is loading", async () => {
		const replacement = deferred<AuthenticatedAppSession>();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockReturnValueOnce(
			Promise.resolve(appSessionFixture()),
		);
		bootstrapService.getSession.mockReturnValueOnce(replacement.promise);
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<CurrentState />
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(screen.getByText("refreshing")).toBeTruthy());
		expect(screen.getByText("Avery Chen")).toBeTruthy();
	});

	it("keeps the cached session when a normal refresh fails", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockReturnValueOnce(
			Promise.resolve(appSessionFixture()),
		);
		bootstrapService.getSession.mockRejectedValueOnce(new Error("offline"));
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<CurrentState />
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(
			screen.queryByText("Unable to prepare your Household. Please try again."),
		).toBeNull();
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session activation failed",
			{ error: expect.any(Error) },
		);
	});

	it("surfaces an error when no cached session exists", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockRejectedValueOnce(new Error("offline"));
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<RetryState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(
				screen.getByText("Unable to prepare your Household. Please try again."),
			).toBeTruthy(),
		);
	});

	it("retries from an error state", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockRejectedValueOnce(new Error("offline"));
		bootstrapService.getSession.mockResolvedValueOnce(appSessionFixture());
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<RetryState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(
				screen.getByText("Unable to prepare your Household. Please try again."),
			).toBeTruthy(),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());
		expect(bootstrapService.getSession).toHaveBeenCalledTimes(2);
	});

	it("fresh-only reload drops cached UI and errors on failure", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockResolvedValueOnce(appSessionFixture());
		bootstrapService.getSession.mockRejectedValueOnce(new Error("offline"));
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<CurrentState />
				<FreshOnlyReloadState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Fresh reload" }));

		await waitFor(() =>
			expect(
				screen.getByText("Unable to prepare your Household. Please try again."),
			).toBeTruthy(),
		);
		expect(screen.queryByText("Avery Chen")).toBeNull();
	});

	it("can retire the current session before requesting a replacement", async () => {
		const replacement = deferred<AuthenticatedAppSession>();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockResolvedValueOnce(appSessionFixture());
		bootstrapService.getSession.mockReturnValueOnce(replacement.promise);
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<RetireSessionState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Retire" }));

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("Avery Chen")).toBeNull();
		await resolveActivation(
			replacement,
			appSessionFixture({ displayName: "Blake" }),
		);
		await waitFor(() => expect(screen.getByText("Blake")).toBeTruthy());
	});

	it("discards stale bootstrap results from superseded activations", async () => {
		const stale = deferred<AuthenticatedAppSession>();
		const fresh = deferred<AuthenticatedAppSession>();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockReturnValueOnce(stale.promise);
		bootstrapService.getSession.mockReturnValueOnce(fresh.promise);
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
			>
				<CurrentState />
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));
		await resolveActivation(stale, appSessionFixture({ displayName: "Stale" }));
		await resolveActivation(fresh, appSessionFixture({ displayName: "Fresh" }));

		await waitFor(() => expect(screen.getByText("Fresh")).toBeTruthy());
		expect(screen.queryByText("Stale")).toBeNull();
	});

	it("signs out through analytics, local wipe, hint cleanup, and Clerk", async () => {
		const order: string[] = [];
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => order.push("track"));
		analytics.reset.mockImplementation(() => order.push("reset"));
		const clearSessionHint = jest.fn(async () => {
			order.push("clear");
		});
		const disconnectAndClear = jest.fn(async () => {
			order.push("disconnect");
		});
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerk");
			}),
		});
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={disconnectAndClear}
				analytics={analytics}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(order).toEqual(["track", "reset", "disconnect", "clear", "clerk"]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(clearSessionHint).toHaveBeenCalledWith();
	});

	it("skips activation runs while sign-out is in progress", async () => {
		const signOutFinished = deferred<void>();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const auth = authFixture({
			signOut: jest.fn(() => signOutFinished.promise),
		});
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(bootstrapService.getSession).toHaveBeenCalledTimes(1),
		);
		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, signedIn: false }}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await Promise.resolve();
		expect(bootstrapService.getSession).toHaveBeenCalledTimes(1);
		signOutFinished.resolve(undefined);
	});
});

function CurrentState() {
	const { state, session } = useAuthenticatedAppSession();
	if (!session) {
		return (
			<Text>{state.status === "error" ? state.message : state.status}</Text>
		);
	}

	return (
		<>
			<Text>{session.activeMember.displayName}</Text>
			<Text>{session.activeHousehold.id}</Text>
			<Text>
				{state.status === "ready" && state.refreshing
					? "refreshing"
					: state.status}
			</Text>
		</>
	);
}

function SignOutButton() {
	const { signOut } = useAuthenticatedAppSession();
	return (
		<Pressable accessibilityRole="button" onPress={() => void signOut()}>
			<Text>Sign out</Text>
		</Pressable>
	);
}

function RetryState() {
	const { state, session, retry } = useAuthenticatedAppSession();
	return (
		<>
			<Text>
				{session
					? session.activeMember.displayName
					: state.status === "error"
						? state.message
						: state.status}
			</Text>
			<Pressable accessibilityRole="button" onPress={retry}>
				<Text>Retry</Text>
			</Pressable>
		</>
	);
}

function ReloadState() {
	const { reloadSession } = useAuthenticatedAppSession();
	return (
		<Pressable accessibilityRole="button" onPress={() => reloadSession()}>
			<Text>Reload</Text>
		</Pressable>
	);
}

function FreshOnlyReloadState() {
	const { reloadSession } = useAuthenticatedAppSession();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={() => reloadSession({ mode: "freshOnly" })}
		>
			<Text>Fresh reload</Text>
		</Pressable>
	);
}

function RetireSessionState() {
	const { state, session, reloadSession } = useAuthenticatedAppSession();
	return (
		<>
			<Text>{session ? session.activeMember.displayName : state.status}</Text>
			<Pressable
				accessibilityRole="button"
				onPress={() => reloadSession({ mode: "retireCurrent" })}
			>
				<Text>Retire</Text>
			</Pressable>
		</>
	);
}

function authFixture(
	overrides: Partial<AuthenticatedAppSessionProviderAuth> = {},
): AuthenticatedAppSessionProviderAuth {
	return {
		getToken: jest.fn(async () => "token"),
		getPowerSyncToken: jest.fn(async () => "powersync-token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function appSessionFixture(
	overrides: { displayName?: string } = {},
): AuthenticatedAppSession {
	const displayName = overrides.displayName ?? "Avery Chen";
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName,
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName,
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName,
			},
		],
	};
}

function bootstrapServiceFixture(
	session: AuthenticatedAppSession,
): jest.Mocked<SessionBootstrapService> {
	return {
		getSession: jest.fn<
			ReturnType<SessionBootstrapService["getSession"]>,
			Parameters<SessionBootstrapService["getSession"]>
		>(async () => session),
	};
}

function connectDatabaseFixture(): jest.MockedFunction<AuthenticatedAppSessionConnectDatabase> {
	return jest.fn<
		ReturnType<AuthenticatedAppSessionConnectDatabase>,
		Parameters<AuthenticatedAppSessionConnectDatabase>
	>(async () => undefined);
}

async function resolveActivation(
	activation: ReturnType<typeof deferred<AuthenticatedAppSession>>,
	session: AuthenticatedAppSession,
) {
	await act(async () => {
		activation.resolve(session);
		await activation.promise;
	});
}

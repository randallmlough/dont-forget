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

		await waitFor(() =>
			expect(screen.getAllByText("Avery Chen").length).toBeGreaterThan(0),
		);
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

	it("surfaces an error when connecting PowerSync fails without a cached session", async () => {
		const connectError = new Error("connect failed");
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockRejectedValueOnce(connectError);
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
			>
				<RetryState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(
				screen.getByText("Unable to prepare your Household. Please try again."),
			).toBeTruthy(),
		);
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session activation failed",
			{ error: connectError },
		);
	});

	it("keeps the cached session when connecting PowerSync fails during a refresh", async () => {
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockResolvedValueOnce(undefined);
		connectDatabase.mockRejectedValueOnce(new Error("connect failed"));
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockResolvedValue(appSessionFixture());
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
			>
				<CurrentState />
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(screen.getAllByText("Avery Chen").length).toBeGreaterThan(0),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(connectDatabase).toHaveBeenCalledTimes(2));
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

		await waitFor(() =>
			expect(screen.getAllByText("Avery Chen").length).toBeGreaterThan(0),
		);
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
		await waitFor(() =>
			expect(screen.getAllByText("Avery Chen").length).toBeGreaterThan(0),
		);

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
				<SignOutButton awaitSignOut />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(order).toEqual(["track", "reset", "disconnect", "clear", "clerk"]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(clearSessionHint).toHaveBeenCalledWith();
	});

	it("ignores duplicate sign-out requests while Clerk sign-out is pending", async () => {
		const clerkSignOut = deferred<void>();
		const analytics = createMockAnalytics();
		const disconnectAndClear = jest.fn(async () => undefined);
		const clearSessionHint = jest.fn(async () => undefined);
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const auth = authFixture({
			signOut: jest.fn(() => clerkSignOut.promise),
		});
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={disconnectAndClear}
				analytics={analytics}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
				clearCurrentListSelectionsForUser={clearCurrentListSelectionsForUser}
			>
				<CurrentState />
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(analytics.reset).toHaveBeenCalledTimes(1);
		expect(disconnectAndClear).toHaveBeenCalledTimes(1);
		expect(clearSessionHint).toHaveBeenCalledTimes(1);
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledTimes(1);

		await act(async () => {
			clerkSignOut.resolve(undefined);
			await clerkSignOut.promise;
		});
	});

	it("recovers the Authenticated App Session before rethrowing when Clerk sign-out fails", async () => {
		const signOutError = new Error("clerk offline");
		const signOutErrors: unknown[] = [];
		const signOutFinished = deferred<void>();
		const recovery = deferred<AuthenticatedAppSession>();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession
			.mockResolvedValueOnce(appSessionFixture())
			.mockReturnValueOnce(recovery.promise);
		const connectDatabase = connectDatabaseFixture();
		const auth = authFixture({
			signOut: jest.fn(() => signOutFinished.promise),
		});
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton
					awaitSignOut
					onError={(error) => signOutErrors.push(error)}
				/>
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		await act(async () => {
			signOutFinished.reject(signOutError);
			await signOutFinished.promise.catch(() => undefined);
		});

		await waitFor(() =>
			expect(bootstrapService.getSession).toHaveBeenCalledTimes(2),
		);
		expect(screen.getByText("loading")).toBeTruthy();
		expect(signOutErrors).toEqual([]);

		await resolveActivation(
			recovery,
			appSessionFixture({ displayName: "Recovered" }),
		);

		await waitFor(() => expect(screen.getByText("Recovered")).toBeTruthy());
		await waitFor(() => expect(signOutErrors).toEqual([signOutError]));
		expect(bootstrapService.getSession).toHaveBeenCalledTimes(2);
		expect(connectDatabase).toHaveBeenCalledTimes(2);
	});

	it("can retry sign-out after recovering from a Clerk sign-out failure", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession
			.mockResolvedValueOnce(appSessionFixture())
			.mockResolvedValueOnce(appSessionFixture({ displayName: "Recovered" }));
		const auth = authFixture({
			signOut: jest
				.fn<Promise<void>, []>()
				.mockRejectedValueOnce(new Error("clerk offline"))
				.mockResolvedValueOnce(undefined),
		});
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton awaitSignOut onError={() => undefined} />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(screen.getByText("Recovered")).toBeTruthy());
		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
		expect(screen.queryByText("Recovered")).toBeNull();
		expect(screen.getByText("loading")).toBeTruthy();
	});

	it("clears the published session after successful sign-out and does not flash the previous User on the next sign-in", async () => {
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession
			.mockResolvedValueOnce(appSessionFixture())
			.mockResolvedValueOnce(appSessionFixture({ displayName: "Blake" }));
		const auth = authFixture();
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton awaitSignOut />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(screen.queryByText("Avery Chen")).toBeNull();
		expect(screen.getByText("loading")).toBeTruthy();

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, signedIn: false }}
				activationEnabled={false}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, signedIn: true }}
				activationEnabled={false}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);
		await Promise.resolve();
		expect(screen.queryByText("Avery Chen")).toBeNull();
		expect(screen.queryByText("Blake")).toBeNull();

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, signedIn: true }}
				activationEnabled
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(screen.getByText("Blake")).toBeTruthy());
		expect(screen.queryByText("Avery Chen")).toBeNull();
	});

	it("replays the latest reload requested while sign-out is pending when Clerk sign-out fails", async () => {
		const signOutFinished = deferred<void>();
		const signOutErrors: unknown[] = [];
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession
			.mockResolvedValueOnce(appSessionFixture())
			.mockResolvedValueOnce(appSessionFixture({ displayName: "Queued" }));
		const auth = authFixture({
			signOut: jest.fn(() => signOutFinished.promise),
		});
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<ReloadState />
				<SignOutButton onError={(error) => signOutErrors.push(error)} />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));
		await act(async () => {
			signOutFinished.reject(new Error("clerk offline"));
			await signOutFinished.promise.catch(() => undefined);
		});

		await waitFor(() => expect(screen.getByText("Queued")).toBeTruthy());
		expect(signOutErrors).toHaveLength(1);
		expect(bootstrapService.getSession).toHaveBeenCalledTimes(2);
	});

	it("clears the last-known User's Current List selections when sign-out starts after the session was retired", async () => {
		const replacement = deferred<AuthenticatedAppSession>();
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession
			.mockResolvedValueOnce(appSessionFixture())
			.mockReturnValueOnce(replacement.promise);
		const auth = authFixture();
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				disconnectAndClear={jest.fn(async () => undefined)}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
				clearCurrentListSelectionsForUser={clearCurrentListSelectionsForUser}
			>
				<CurrentState />
				<RetireSessionState />
				<SignOutButton awaitSignOut />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(screen.getAllByText("Avery Chen").length).toBeGreaterThan(0),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Retire" }));
		await waitFor(() =>
			expect(screen.getAllByText("loading").length).toBeGreaterThan(0),
		);
		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() =>
			expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith(
				"usr_avery",
			),
		);
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
		await act(async () => {
			signOutFinished.resolve(undefined);
			await signOutFinished.promise;
		});
	});

	it("disconnects PowerSync when sign-out completes while the database connect is in flight", async () => {
		const connect = deferred<void>();
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockReturnValueOnce(connect.promise);
		const disconnectAndClear = jest.fn(async () => undefined);
		const auth = authFixture();
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				disconnectAndClear={disconnectAndClear}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton awaitSignOut />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(connectDatabase).toHaveBeenCalledTimes(1));

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(disconnectAndClear).toHaveBeenCalledTimes(1);

		await act(async () => {
			connect.resolve(undefined);
			await connect.promise;
		});

		await waitFor(() => expect(disconnectAndClear).toHaveBeenCalledTimes(2));
		expect(screen.getByText("loading")).toBeTruthy();
	});

	it("leaves PowerSync connected when a superseded reload connect resolves after the replacement is ready", async () => {
		const staleConnect = deferred<void>();
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockReturnValueOnce(staleConnect.promise);
		const disconnectAndClear = jest.fn(async () => undefined);
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				disconnectAndClear={disconnectAndClear}
			>
				<CurrentState />
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(connectDatabase).toHaveBeenCalledTimes(1));

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());
		await act(async () => {
			staleConnect.resolve(undefined);
			await staleConnect.promise;
		});

		expect(disconnectAndClear).toHaveBeenCalledTimes(0);
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(mockLogger.error).not.toHaveBeenCalledWith(
			"authenticated app session stale connect cleanup failed",
			expect.anything(),
		);
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

function SignOutButton({
	awaitSignOut = false,
	onError,
}: {
	awaitSignOut?: boolean;
	onError?: (error: unknown) => void;
}) {
	const { signOut } = useAuthenticatedAppSession();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={() => {
				const result = signOut().catch((error: unknown) => onError?.(error));
				if (awaitSignOut) return result;
				void result;
			}}
		>
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

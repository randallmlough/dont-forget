import { useLogger } from "@mobile/lib/logger";
import type { SessionBootstrapService } from "@mobile/session/bootstrap";
import { deferred } from "@mobile/test/async";
import { createMockAnalytics } from "@mobile/test/mocks/analytics";
import { createMockLogger, type MockLogger } from "@mobile/test/mocks/logger";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import type { DatabaseOwnership } from "./database-ownership";
import {
	type AuthenticatedAppSession,
	type AuthenticatedAppSessionConnectDatabase,
	AuthenticatedAppSessionProvider,
	type AuthenticatedAppSessionProviderAuth,
	useAuthenticatedAppSession,
} from "./provider";
import {
	persistAuthenticatedAppSession,
	readPersistedAuthenticatedAppSession,
} from "./session-hint";

let mockLogger: MockLogger;

jest.mock("@mobile/lib/logger", () =>
	jest
		.requireActual<typeof import("@mobile/test/mocks/logger")>(
			"@mobile/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

jest.mock("@mobile/lib/analytics", () =>
	jest.requireActual("@mobile/test/mocks/analytics"),
);

jest.mock("./database-ownership", () => ({
	databaseOwnership: {
		prepareForUser: jest.fn(async () => ({ status: "ready" })),
		removePreviousUserDataAndPrepare: jest.fn(async () => undefined),
	},
}));

jest.mock("./session-hint", () => ({
	clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
	persistAuthenticatedAppSession: jest.fn(async () => undefined),
	readPersistedAuthenticatedAppSession: jest.fn(async () => null),
}));

describe("AuthenticatedAppSessionProvider", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLogger = createMockLogger();
		mockLogger.with.mockReturnValue(mockLogger);
		jest.mocked(useLogger).mockReturnValue(mockLogger);
		jest.mocked(readPersistedAuthenticatedAppSession).mockResolvedValue(null);
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
		expect(persistAuthenticatedAppSession).toHaveBeenCalledWith(
			persistedSessionFixture(session),
		);
	});

	it("blocks a different database owner before connecting or persisting the incoming session", async () => {
		const session = appSessionFixture({
			displayName: "Blake",
			userId: "usr_blake",
		});
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest.fn(async () => ({
				status: "differentUserBlocked" as const,
			})),
		});
		const connectDatabase = connectDatabaseFixture();

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ clerkUserId: "user_blake" })}
				bootstrapService={bootstrapServiceFixture(session)}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<LocalDataStateView />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked")).toBeTruthy(),
		);
		expect(databaseOwnership.prepareForUser).toHaveBeenCalledWith("usr_blake");
		expect(connectDatabase).not.toHaveBeenCalled();
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("disconnects a directly replaced User and blocks the incoming User before connect", async () => {
		const userASession = appSessionFixture();
		const userBSession = appSessionFixture({
			displayName: "Blake",
			userId: "usr_blake",
		});
		const bootstrapService = bootstrapServiceFixture(userASession);
		bootstrapService.getSession
			.mockResolvedValueOnce(userASession)
			.mockResolvedValueOnce(userBSession);
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest
				.fn()
				.mockResolvedValueOnce({ status: "ready" })
				.mockResolvedValueOnce({ status: "differentUserBlocked" }),
		});
		const connectDatabase = connectDatabaseFixture();
		const disconnect = jest.fn(async () => undefined);
		const userAAuth = authFixture();
		const view = await render(
			<AuthenticatedAppSessionProvider
				auth={userAAuth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
			>
				<CurrentState />
				<LocalDataStateView />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());
		await waitFor(() =>
			expect(persistAuthenticatedAppSession).toHaveBeenCalledWith(
				persistedSessionFixture(userASession),
			),
		);

		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...userAAuth, clerkUserId: "user_blake" }}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
			>
				<CurrentState />
				<LocalDataStateView />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked")).toBeTruthy(),
		);
		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("Blake")).toBeNull();
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalledWith(
			persistedSessionFixture(userBSession, "user_blake"),
		);
	});

	it("publishes a retryable error when ownership preparation fails", async () => {
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest.fn(async () => {
				throw new Error("owner marker unavailable");
			}),
		});
		const connectDatabase = connectDatabaseFixture();

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(
				screen.getByText("Unable to prepare your Household. Please try again."),
			).toBeTruthy(),
		);
		expect(connectDatabase).not.toHaveBeenCalled();
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("does not connect when ownership preparation becomes stale", async () => {
		const preparation = deferred<{ status: "ready" }>();
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest.fn(() => preparation.promise),
		});
		const connectDatabase = connectDatabaseFixture();
		const auth = authFixture();
		const view = await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(databaseOwnership.prepareForUser).toHaveBeenCalledTimes(1),
		);

		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, clerkUserId: null, signedIn: false }}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await act(async () => {
			preparation.resolve({ status: "ready" });
			await preparation.promise;
		});

		expect(connectDatabase).not.toHaveBeenCalled();
		expect(screen.getByText("loading")).toBeTruthy();
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("removes confirmed previous-User data before activating the incoming User", async () => {
		const session = appSessionFixture({
			displayName: "Blake",
			userId: "usr_blake",
		});
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest
				.fn()
				.mockResolvedValueOnce({ status: "differentUserBlocked" })
				.mockResolvedValueOnce({ status: "ready" }),
		});
		const connectDatabase = connectDatabaseFixture();

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ clerkUserId: "user_blake" })}
				bootstrapService={bootstrapServiceFixture(session)}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<CurrentState />
				<LocalDataActionsView />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked:false:none")).toBeTruthy(),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Remove data" }));

		await waitFor(() => expect(screen.getByText("Blake")).toBeTruthy());
		expect(
			databaseOwnership.removePreviousUserDataAndPrepare,
		).toHaveBeenCalledWith("usr_blake");
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(persistAuthenticatedAppSession).toHaveBeenCalledWith(
			persistedSessionFixture(session, "user_blake"),
		);
	});

	it("stays blocked with a retryable error when previous-User removal fails", async () => {
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest.fn(async () => ({
				status: "differentUserBlocked" as const,
			})),
			removePreviousUserDataAndPrepare: jest.fn(async () => {
				throw new Error("clear failed");
			}),
		});
		const connectDatabase = connectDatabaseFixture();

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ clerkUserId: "user_blake" })}
				bootstrapService={bootstrapServiceFixture(
					appSessionFixture({ displayName: "Blake", userId: "usr_blake" }),
				)}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<LocalDataActionsView />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked:false:none")).toBeTruthy(),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Remove data" }));

		await waitFor(() =>
			expect(
				screen.getByText(
					"differentUserBlocked:false:Unable to remove the previous User's data. Please try again.",
				),
			).toBeTruthy(),
		);
		expect(connectDatabase).not.toHaveBeenCalled();
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("signs out only the authenticated incoming User for previous-User recovery", async () => {
		const auth = authFixture({ clerkUserId: "user_blake" });
		const analytics = createMockAnalytics();
		const clearSessionHint = jest.fn(async () => undefined);
		const disconnect = jest.fn(async () => undefined);
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest.fn(async () => ({
				status: "differentUserBlocked" as const,
			})),
		});

		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				analytics={analytics}
				bootstrapService={bootstrapServiceFixture(
					appSessionFixture({ displayName: "Blake", userId: "usr_blake" }),
				)}
				connectDatabase={connectDatabaseFixture()}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<LocalDataActionsView />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked:false:none")).toBeTruthy(),
		);

		await fireEvent.press(
			screen.getByRole("button", { name: "Previous User" }),
		);

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(
			databaseOwnership.removePreviousUserDataAndPrepare,
		).not.toHaveBeenCalled();
		expect(clearSessionHint).not.toHaveBeenCalled();
		expect(disconnect).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalledWith("user_signed_out", {});
	});

	it("rechecks blocked identity before a queued confirmed removal starts", async () => {
		const staleConnect = deferred<void>();
		const correctiveDisconnect = deferred<void>();
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest
				.fn()
				.mockResolvedValueOnce({ status: "ready" })
				.mockResolvedValueOnce({ status: "differentUserBlocked" }),
		});
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockReturnValueOnce(staleConnect.promise);
		const disconnect = jest
			.fn<Promise<void>, []>()
			.mockReturnValueOnce(correctiveDisconnect.promise)
			.mockResolvedValue(undefined);
		const auth = authFixture({ clerkUserId: "user_blake" });
		const view = await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapServiceFixture(
					appSessionFixture({ displayName: "Blake", userId: "usr_blake" }),
				)}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
			>
				<CurrentState />
				<ReloadState />
				<LocalDataActionsView />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(connectDatabase).toHaveBeenCalledTimes(1));

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));
		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked:false:none")).toBeTruthy(),
		);
		await act(async () => {
			staleConnect.resolve(undefined);
			await staleConnect.promise;
		});
		await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));

		await fireEvent.press(screen.getByRole("button", { name: "Remove data" }));
		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked:true:none")).toBeTruthy(),
		);
		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, clerkUserId: null, signedIn: false }}
				bootstrapService={bootstrapServiceFixture(
					appSessionFixture({ displayName: "Blake", userId: "usr_blake" }),
				)}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
			>
				<CurrentState />
				<ReloadState />
				<LocalDataActionsView />
			</AuthenticatedAppSessionProvider>,
		);
		await act(async () => {
			correctiveDisconnect.resolve(undefined);
			await correctiveDisconnect.promise;
		});

		await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(2));
		expect(
			databaseOwnership.removePreviousUserDataAndPrepare,
		).not.toHaveBeenCalled();
	});

	it("restores a persisted Authenticated App Session when Clerk is ready but signed out", async () => {
		const session = appSessionFixture({ displayName: "Cached Avery" });
		const analytics = createMockAnalytics();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const connectDatabase = connectDatabaseFixture();
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(persistedSessionFixture(session));

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ signedIn: false })}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(screen.getByText("Cached Avery")).toBeTruthy());
		expect(screen.getByText("hh_avery")).toBeTruthy();
		expect(screen.getByText("ready")).toBeTruthy();
		expect(bootstrapService.getSession).not.toHaveBeenCalled();
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(analytics.track).toHaveBeenCalledWith(
			"authenticated_app_session_loaded",
			{
				household_id: "hh_avery",
				member_role: "owner",
				member_count: 1,
				source: "cached",
			},
		);
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
	});

	it("refuses a signed-out null-subject restore before ownership preparation", async () => {
		const session = appSessionFixture({ displayName: "Cached Avery" });
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest.fn(async () => ({
				status: "differentUserBlocked" as const,
			})),
		});
		const connectDatabase = connectDatabaseFixture();
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(persistedSessionFixture(session));

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ clerkUserId: null, signedIn: false })}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
			>
				<LocalDataStateView />
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(readPersistedAuthenticatedAppSession).toHaveBeenCalledTimes(1),
		);
		expect(screen.getByText("ready")).toBeTruthy();
		expect(screen.getByText("loading")).toBeTruthy();
		expect(databaseOwnership.prepareForUser).not.toHaveBeenCalled();
		expect(connectDatabase).not.toHaveBeenCalled();
		expect(
			databaseOwnership.removePreviousUserDataAndPrepare,
		).not.toHaveBeenCalled();
	});

	it("restores a persisted Authenticated App Session when signed-in bootstrap is offline during cold start", async () => {
		const session = appSessionFixture({ displayName: "Cached Avery" });
		const analytics = createMockAnalytics();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		bootstrapService.getSession.mockRejectedValueOnce(new Error("offline"));
		const connectDatabase = connectDatabaseFixture();
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(persistedSessionFixture(session));

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(screen.getByText("Cached Avery")).toBeTruthy());
		expect(screen.getByText("hh_avery")).toBeTruthy();
		expect(screen.getByText("ready")).toBeTruthy();
		expect(bootstrapService.getSession).toHaveBeenCalledTimes(1);
		expect(readPersistedAuthenticatedAppSession).toHaveBeenCalledTimes(1);
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(analytics.track).toHaveBeenCalledWith(
			"authenticated_app_session_loaded",
			{
				household_id: "hh_avery",
				member_role: "owner",
				member_count: 1,
				source: "cached",
			},
		);
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("refuses a signed-in offline fallback cached for another Clerk subject after cleanup fails", async () => {
		const userASession = appSessionFixture({ displayName: "User A" });
		const bootstrapService = bootstrapServiceFixture(userASession);
		const connectDatabase = connectDatabaseFixture();
		const cleanupError = new Error("storage unavailable");
		const clearSessionHint = jest
			.fn<Promise<void>, []>()
			.mockRejectedValueOnce(cleanupError)
			.mockResolvedValueOnce(undefined);
		const userAAuth = authFixture({ clerkUserId: "user_clerk_a" });
		const view = await render(
			<AuthenticatedAppSessionProvider
				auth={userAAuth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("User A")).toBeTruthy());

		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...userAAuth, clerkUserId: null, signedIn: false }}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(clearSessionHint).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());

		jest.mocked(readPersistedAuthenticatedAppSession).mockClear();
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(
				persistedSessionFixture(userASession, "user_clerk_a"),
			);
		bootstrapService.getSession.mockRejectedValueOnce(new Error("offline"));

		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...userAAuth, clerkUserId: "user_clerk_b", signedIn: true }}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(clearSessionHint).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(
				screen.getByText("Unable to prepare your Household. Please try again."),
			).toBeTruthy(),
		);
		expect(screen.queryByText("User A")).toBeNull();
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(readPersistedAuthenticatedAppSession).toHaveBeenCalledTimes(1);
	});

	it("clears and refuses a signed-out cold restore cached for another Clerk subject", async () => {
		const cachedSession = appSessionFixture({ displayName: "Cached User A" });
		const clearSessionHint = jest.fn(async () => undefined);
		const connectDatabase = connectDatabaseFixture();
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(
				persistedSessionFixture(cachedSession, "user_clerk_a"),
			);

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({
					clerkUserId: "user_clerk_b",
					signedIn: false,
				})}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(clearSessionHint).toHaveBeenCalledTimes(1));
		expect(screen.queryByText("Cached User A")).toBeNull();
		expect(connectDatabase).not.toHaveBeenCalled();
	});

	it("surfaces restore connect failures and retries the retained payload", async () => {
		const connectError = new Error("restore connect failed");
		const session = appSessionFixture({ displayName: "Cached Avery" });
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const connectDatabase = connectDatabaseFixture();
		connectDatabase
			.mockRejectedValueOnce(connectError)
			.mockResolvedValueOnce(undefined);
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(persistedSessionFixture(session));

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ signedIn: false })}
				bootstrapService={bootstrapService}
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
			"authenticated app session restore failed",
			{ error: connectError },
		);

		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(screen.getByText("Cached Avery")).toBeTruthy());
		expect(readPersistedAuthenticatedAppSession).toHaveBeenCalledTimes(1);
		expect(connectDatabase).toHaveBeenCalledTimes(2);
		expect(bootstrapService.getSession).not.toHaveBeenCalled();
	});

	it("logs persisted payload read failures without starting restore", async () => {
		const readError = new Error("storage unavailable");
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockRejectedValueOnce(readError);
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const connectDatabase = connectDatabaseFixture();

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ signedIn: false })}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(readPersistedAuthenticatedAppSession).toHaveBeenCalledTimes(1),
		);
		expect(screen.getByText("loading")).toBeTruthy();
		expect(connectDatabase).not.toHaveBeenCalled();
		expect(bootstrapService.getSession).not.toHaveBeenCalled();
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session restore read failed",
			{ error: readError },
		);
	});

	it("keeps the signed-out loading behavior unchanged when no persisted session exists", async () => {
		const analytics = createMockAnalytics();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const connectDatabase = connectDatabaseFixture();
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(null);

		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture({ signedIn: false })}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(readPersistedAuthenticatedAppSession).toHaveBeenCalledTimes(1),
		);
		expect(screen.getByText("loading")).toBeTruthy();
		expect(bootstrapService.getSession).not.toHaveBeenCalled();
		expect(connectDatabase).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("blocks a different signed-in User after disconnecting a restored session", async () => {
		const cachedSession = appSessionFixture({ displayName: "Cached Avery" });
		const freshSession = appSessionFixture({
			displayName: "Blake",
			userId: "usr_blake",
		});
		const order: string[] = [];
		const analytics = createMockAnalytics();
		const bootstrapService = bootstrapServiceFixture(freshSession);
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockImplementation(async () => {
			order.push("restoreConnect");
		});
		const clearSessionHint = jest.fn(async () => {
			order.push("clear");
		});
		const disconnect = jest.fn(async () => {
			order.push("disconnect");
		});
		const databaseOwnership = databaseOwnershipFixture({
			prepareForUser: jest
				.fn()
				.mockResolvedValueOnce({ status: "ready" })
				.mockResolvedValueOnce({ status: "differentUserBlocked" }),
		});
		const signedOutAuth = authFixture({ signedIn: false });
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(persistedSessionFixture(cachedSession));

		const view = await render(
			<AuthenticatedAppSessionProvider
				auth={signedOutAuth}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
				<LocalDataStateView />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Cached Avery")).toBeTruthy());

		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{
					...signedOutAuth,
					clerkUserId: "user_blake",
					signedIn: true,
				}}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				databaseOwnership={databaseOwnership}
				disconnect={disconnect}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
				<LocalDataStateView />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() =>
			expect(screen.getByText("differentUserBlocked")).toBeTruthy(),
		);
		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(clearSessionHint).not.toHaveBeenCalled();
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["restoreConnect", "disconnect"]);
		expect(screen.queryByText("Blake")).toBeNull();
		expect(persistAuthenticatedAppSession).not.toHaveBeenCalled();
		expect(
			databaseOwnership.removePreviousUserDataAndPrepare,
		).not.toHaveBeenCalled();
	});

	it("reconnects a restored session for the same User without removing local data", async () => {
		const cachedSession = appSessionFixture({ displayName: "Cached Avery" });
		const freshSession = appSessionFixture({ displayName: "Online Avery" });
		const analytics = createMockAnalytics();
		const bootstrapService = bootstrapServiceFixture(freshSession);
		const connectDatabase = connectDatabaseFixture();
		const disconnect = jest.fn(async () => undefined);
		const signedOutAuth = authFixture({ signedIn: false });
		jest
			.mocked(readPersistedAuthenticatedAppSession)
			.mockResolvedValueOnce(persistedSessionFixture(cachedSession));

		const view = await render(
			<AuthenticatedAppSessionProvider
				auth={signedOutAuth}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Cached Avery")).toBeTruthy());

		await view.rerender(
			<AuthenticatedAppSessionProvider
				auth={{
					...signedOutAuth,
					clerkUserId: "user_avery",
					signedIn: true,
				}}
				analytics={analytics}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(screen.getByText("Online Avery")).toBeTruthy());
		expect(screen.queryByText("Cached Avery")).toBeNull();
		expect(connectDatabase).toHaveBeenCalledTimes(2);
		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(persistAuthenticatedAppSession).toHaveBeenLastCalledWith(
			persistedSessionFixture(freshSession),
		);
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

	it("clears the persisted restore payload when an online session loses auth mid-run", async () => {
		const clearSessionHint = jest.fn(async () => undefined);
		const auth = authFixture();
		const bootstrapService = bootstrapServiceFixture(appSessionFixture());
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() => expect(screen.getByText("Avery Chen")).toBeTruthy());

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, signedIn: false }}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabaseFixture()}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(clearSessionHint).toHaveBeenCalledTimes(1);
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

	it("signs out through analytics, hint cleanup, Clerk, and disconnect", async () => {
		const order: string[] = [];
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => order.push("track"));
		analytics.reset.mockImplementation(() => order.push("reset"));
		const clearSessionHint = jest.fn(async () => {
			order.push("clear");
		});
		const disconnect = jest.fn(async () => {
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
				disconnect={disconnect}
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

		expect(order).toEqual(["clear", "clerk", "disconnect", "track", "reset"]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(clearSessionHint).toHaveBeenCalledWith();
	});

	it("ignores duplicate sign-out requests while Clerk sign-out is pending", async () => {
		const clerkSignOut = deferred<void>();
		const analytics = createMockAnalytics();
		const disconnect = jest.fn(async () => undefined);
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
				disconnect={disconnect}
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

		expect(analytics.track).not.toHaveBeenCalled();
		expect(analytics.reset).not.toHaveBeenCalled();
		expect(disconnect).not.toHaveBeenCalled();
		expect(clearSessionHint).toHaveBeenCalledTimes(1);
		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();

		await act(async () => {
			clerkSignOut.resolve(undefined);
			await clerkSignOut.promise;
		});
		await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledTimes(1);
		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(analytics.reset).toHaveBeenCalledTimes(1);
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
				disconnect={jest.fn(async () => undefined)}
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
		const disconnect = jest.fn(async () => undefined);
		const auth = authFixture();
		await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
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
		expect(disconnect).toHaveBeenCalledTimes(1);

		await act(async () => {
			connect.resolve(undefined);
			await connect.promise;
		});

		await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(2));
		expect(screen.getByText("loading")).toBeTruthy();
	});

	it("leaves PowerSync connected when a superseded reload connect resolves after the replacement is ready", async () => {
		const staleConnect = deferred<void>();
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockReturnValueOnce(staleConnect.promise);
		const disconnect = jest.fn(async () => undefined);
		await render(
			<AuthenticatedAppSessionProvider
				auth={authFixture()}
				bootstrapService={bootstrapServiceFixture(appSessionFixture())}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
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

		expect(disconnect).toHaveBeenCalledTimes(0);
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

function LocalDataStateView() {
	const { localData } = useAuthenticatedAppSession();
	return <Text>{localData.status}</Text>;
}

function LocalDataActionsView() {
	const { localData, signInAsPreviousUser, removePreviousUserDataAndContinue } =
		useAuthenticatedAppSession();
	return (
		<>
			<Text>
				{localData.status === "differentUserBlocked"
					? `${localData.status}:${localData.isRemoving}:${localData.errorMessage ?? "none"}`
					: localData.status}
			</Text>
			<Pressable
				accessibilityRole="button"
				onPress={() => void signInAsPreviousUser()}
			>
				<Text>Previous User</Text>
			</Pressable>
			<Pressable
				accessibilityRole="button"
				onPress={() => void removePreviousUserDataAndContinue()}
			>
				<Text>Remove data</Text>
			</Pressable>
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
		clerkUserId: "user_avery",
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function persistedSessionFixture(
	session: AuthenticatedAppSession,
	clerkUserId = "user_avery",
) {
	return { clerkUserId, session };
}

function appSessionFixture(
	overrides: { displayName?: string; userId?: string } = {},
): AuthenticatedAppSession {
	const displayName = overrides.displayName ?? "Avery Chen";
	const userId = overrides.userId ?? "usr_avery";
	return {
		user: {
			id: userId,
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
			userId,
			role: "owner",
			displayName,
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId,
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

function databaseOwnershipFixture(
	overrides: Partial<DatabaseOwnership> = {},
): jest.Mocked<DatabaseOwnership> {
	return {
		prepareForUser: jest.fn<
			ReturnType<DatabaseOwnership["prepareForUser"]>,
			Parameters<DatabaseOwnership["prepareForUser"]>
		>(overrides.prepareForUser ?? (async () => ({ status: "ready" }))),
		removePreviousUserDataAndPrepare: jest.fn<
			ReturnType<DatabaseOwnership["removePreviousUserDataAndPrepare"]>,
			Parameters<DatabaseOwnership["removePreviousUserDataAndPrepare"]>
		>(overrides.removePreviousUserDataAndPrepare ?? (async () => undefined)),
	};
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

describe("AuthenticatedAppSessionProvider database operation ordering", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLogger = createMockLogger();
		mockLogger.with.mockReturnValue(mockLogger);
		jest.mocked(useLogger).mockReturnValue(mockLogger);
	});

	it("orders a stale corrective disconnect before the next User database connect", async () => {
		const staleConnect = deferred<void>();
		const correctiveDisconnect = deferred<void>();
		const initialSession = appSessionFixture();
		const nextSession = appSessionFixture({ displayName: "Blake" });
		const bootstrapService = bootstrapServiceFixture(initialSession);
		bootstrapService.getSession
			.mockResolvedValueOnce(initialSession)
			.mockResolvedValueOnce(nextSession);
		const connectDatabase = connectDatabaseFixture();
		connectDatabase.mockReturnValueOnce(staleConnect.promise);
		const disconnect = jest
			.fn<Promise<void>, []>()
			.mockResolvedValueOnce(undefined)
			.mockReturnValueOnce(correctiveDisconnect.promise);
		const auth = authFixture();
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				auth={auth}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
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
		expect(disconnect).toHaveBeenCalledTimes(1);

		await act(async () => {
			staleConnect.resolve(undefined);
			await staleConnect.promise;
		});
		await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(2));

		await rerender(
			<AuthenticatedAppSessionProvider
				auth={{ ...auth, signedIn: false }}
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
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
				bootstrapService={bootstrapService}
				connectDatabase={connectDatabase}
				disconnect={disconnect}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
			>
				<CurrentState />
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);
		await waitFor(() =>
			expect(bootstrapService.getSession).toHaveBeenCalledTimes(2),
		);
		await Promise.resolve();
		expect(connectDatabase).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("Blake")).toBeNull();
		expect(screen.getByText("loading")).toBeTruthy();

		await act(async () => {
			correctiveDisconnect.resolve(undefined);
			await correctiveDisconnect.promise;
		});

		await waitFor(() => expect(connectDatabase).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.getByText("Blake")).toBeTruthy());
		expect(screen.getByText("ready")).toBeTruthy();
	});
});

import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useLogger } from "@/lib/logger";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionStateSnapshot,
} from "@/lib/services/session";
import { deferred } from "@/lib/test/async";
import { createMockAnalytics } from "@/lib/test/mocks/analytics";
import { createMockLogger, type MockLogger } from "@/lib/test/mocks/logger";
import {
	AuthenticatedAppSessionProvider,
	useAuthenticatedAppSession,
} from "./authenticated-app-session-provider";

let mockLogger: MockLogger;

jest.mock("@/lib/logger", () =>
	jest
		.requireActual<typeof import("@/lib/test/mocks/logger")>(
			"@/lib/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

describe("AuthenticatedAppSessionProvider", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLogger = createMockLogger();
		mockLogger.with.mockReturnValue(mockLogger);
		jest.mocked(useLogger).mockReturnValue(mockLogger);
	});

	it("eagerly activates the controller and renders fresh ready state", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		expect(controller.activate).toHaveBeenCalledWith({
			getToken: expect.any(Function),
			authReady: true,
			signedIn: true,
			cachePolicy: "allowCached",
		});

		await act(() => {
			controller.publish({ status: "ready", session: appSessionFixture() });
		});

		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:1")).toBeTruthy(),
		);
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("ready")).toBeTruthy();
	});

	it("can defer initial activation until reload is requested", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
				activationEnabled={false}
			>
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);

		await Promise.resolve();
		expect(controller.activate).not.toHaveBeenCalled();

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(1));
	});

	it("does not reactivate when only the token callback identity changes", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		const firstAuth = authFixture();
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider controller={controller} auth={firstAuth}>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		expect(controller.activate).toHaveBeenCalledTimes(1);

		await rerender(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture({
					getToken: jest.fn(async () => "next-token"),
				})}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await Promise.resolve();
		expect(controller.activate).toHaveBeenCalledTimes(1);
	});

	it("keeps the previous session while a replacement is loading", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		await act(() => {
			controller.publish({
				status: "loading",
				previous: appSessionFixture(),
				refreshingSession: true,
			});
		});

		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:1")).toBeTruthy(),
		);
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("refreshing")).toBeTruthy();
	});

	it("can retire the current session before requesting replacement activation", async () => {
		const controller = authenticatedAppSessionControllerFixture({
			snapshot: { status: "ready", session: appSessionFixture() },
		});
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<RetireSessionState />
			</AuthenticatedAppSessionProvider>,
		);
		expect(screen.getByText("authenticated-app-session:1")).toBeTruthy();

		await fireEvent.press(screen.getByRole("button", { name: "Retire" }));

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("authenticated-app-session:1")).toBeNull();
		expect(controller.activate).toHaveBeenCalledTimes(2);
		expect(controller.invalidateCurrentSession).toHaveBeenCalledTimes(1);
	});

	it("stops exposing ready session data while loading has no previous session", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		await act(() => {
			controller.publish({ status: "ready", session: appSessionFixture() });
		});
		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:1")).toBeTruthy(),
		);

		await act(() => {
			controller.publish({ status: "loading" });
		});

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("authenticated-app-session:1")).toBeNull();
	});

	it("exposes error state and retries with the latest auth inputs", async () => {
		const auth = authFixture();
		const controller = authenticatedAppSessionControllerFixture({
			snapshot: {
				status: "error",
				message: "Unable to prepare your Household.",
			},
		});
		await render(
			<AuthenticatedAppSessionProvider controller={controller} auth={auth}>
				<RetryState />
			</AuthenticatedAppSessionProvider>,
		);

		expect(screen.getByText("Unable to prepare your Household.")).toBeTruthy();
		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(2));
		const [activation] = controller.activate.mock.calls.at(-1) ?? [];
		expect(activation).toMatchObject({
			authReady: true,
			signedIn: true,
		});
		await expect(activation?.getToken()).resolves.toBe("token");

		await act(() => {
			controller.publish({ status: "ready", session: appSessionFixture() });
		});
		expect(screen.getByText("authenticated-app-session:1")).toBeTruthy();
	});

	it("reloads the Authenticated App Session with the latest auth inputs", async () => {
		const auth = authFixture();
		const controller = authenticatedAppSessionControllerFixture();
		await render(
			<AuthenticatedAppSessionProvider controller={controller} auth={auth}>
				<ReloadState />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(2));
		const [activation] = controller.activate.mock.calls.at(-1) ?? [];
		expect(activation).toMatchObject({
			authReady: true,
			signedIn: true,
		});
		await expect(activation?.getToken()).resolves.toBe("token");
	});

	it("can request a fresh-only Authenticated App Session reload", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<FreshOnlyReloadState />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Fresh reload" }));

		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(2));
		expect(controller.activate.mock.calls.at(-1)?.[0]).toMatchObject({
			cachePolicy: "freshOnly",
		});
	});

	it("can retire and await a durable fresh Authenticated App Session reload", async () => {
		const activationFinished = deferred<void>();
		const controller = authenticatedAppSessionControllerFixture({
			snapshot: { status: "ready", session: appSessionFixture() },
		});
		controller.activate.mockImplementationOnce(async () => {
			await activationFinished.promise;
			controller.publish({
				status: "ready",
				session: appSessionFixture({
					resourceKey: "authenticated-app-session:2",
				}),
			});
		});
		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
				activationEnabled={false}
			>
				<AwaitableRetireSessionState />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Await retire" }));

		await waitFor(() =>
			expect(controller.invalidateCurrentSession).toHaveBeenCalledTimes(1),
		);
		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(1));
		expect(controller.activate).toHaveBeenCalledWith({
			getToken: expect.any(Function),
			authReady: true,
			signedIn: true,
			cachePolicy: "freshOnly",
			waitForFreshCachePersistence: true,
		});
		expect(screen.getByText("waiting")).toBeTruthy();

		activationFinished.resolve(undefined);

		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:2")).toBeTruthy(),
		);
		expect(
			controller.invalidateCurrentSession.mock.invocationCallOrder[0],
		).toBeLessThan(controller.activate.mock.invocationCallOrder[0]);
	});

	it("signs out in analytics, controller, local cleanup, Clerk order", async () => {
		const order: string[] = [];
		const controller = authenticatedAppSessionControllerFixture();
		controller.dispose.mockImplementation(async () => {
			order.push("dispose");
			return { householdIdsForLocalDataDeletion: [] };
		});
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerk");
			}),
		});
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => order.push("track"));
		analytics.reset.mockImplementation(() => order.push("reset"));
		const clearSignedOutData = jest.fn(async () => {
			order.push("clear");
		});

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(order).toEqual(["track", "reset", "dispose", "clear", "clerk"]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(clearSignedOutData).toHaveBeenCalledWith([]);
	});

	it("uses the latest sign-out dependencies after provider rerender", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		const auth = authFixture();
		const firstAnalytics = { track: jest.fn(), reset: jest.fn() };
		const nextAnalytics = { track: jest.fn(), reset: jest.fn() };
		const firstClearSignedOutData = jest.fn(async () => undefined);
		const nextClearSignedOutData = jest.fn(async () => undefined);
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={firstAnalytics}
				clearSignedOutSessionData={firstClearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await rerender(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={nextAnalytics}
				clearSignedOutSessionData={nextClearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(firstAnalytics.track).not.toHaveBeenCalled();
		expect(firstAnalytics.reset).not.toHaveBeenCalled();
		expect(firstClearSignedOutData).not.toHaveBeenCalled();
		expect(nextAnalytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(nextAnalytics.reset).toHaveBeenCalledTimes(1);
		expect(nextClearSignedOutData).toHaveBeenCalledWith([]);
	});

	it("passes disposed Household IDs to signed-out cleanup", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		controller.dispose.mockResolvedValue({
			householdIdsForLocalDataDeletion: ["hh_active"],
		});
		const clearSignedOutData = jest.fn(async () => undefined);

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() =>
			expect(clearSignedOutData).toHaveBeenCalledWith(["hh_active"]),
		);
	});

	it("continues Clerk sign out when controller disposal fails", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		controller.dispose.mockRejectedValue(new Error("dispose failed"));
		const auth = authFixture();

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out dispose failed",
			{ error: expect.any(Error) },
		);
	});

	it("ignores duplicate sign-out presses while the first sign-out is pending", async () => {
		const auth = authFixture();
		const controller = authenticatedAppSessionControllerFixture();
		const analytics = createMockAnalytics();
		const localDataDeleted = deferred<void>();
		const clearSignedOutData = jest.fn(() => localDataDeleted.promise);

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		const signOutButton = screen.getByRole("button", { name: "Sign out" });
		await fireEvent.press(signOutButton);
		await fireEvent.press(signOutButton);

		await waitFor(() => expect(clearSignedOutData).toHaveBeenCalledTimes(1));
		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(analytics.reset).toHaveBeenCalledTimes(1);
		expect(controller.dispose).toHaveBeenCalledTimes(1);
		expect(auth.signOut).not.toHaveBeenCalled();

		localDataDeleted.resolve(undefined);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("skips activation runs while sign-out is in progress", async () => {
		const signOutFinished = deferred<void>();
		const controller = authenticatedAppSessionControllerFixture();
		const auth = authFixture({
			signOut: jest.fn(() => signOutFinished.promise),
		});
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		expect(controller.activate).toHaveBeenCalledTimes(1);
		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		await rerender(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={{ ...auth, signedIn: false }}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await Promise.resolve();
		expect(controller.activate).toHaveBeenCalledTimes(1);
		signOutFinished.resolve(undefined);
	});

	it("allows sign-out retry after Clerk sign-out fails", async () => {
		const auth = authFixture({
			signOut: jest
				.fn()
				.mockRejectedValueOnce(new Error("sign out failed"))
				.mockResolvedValueOnce(undefined),
		});
		const controller = authenticatedAppSessionControllerFixture();

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<CatchingSignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		const button = screen.getByRole("button", { name: "Sign out" });
		await fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(2));

		await fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
	});

	it("allows sign-out retry after cleanup fails and Clerk sign-out succeeds", async () => {
		const auth = authFixture();

		await render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={jest.fn(async () => {
					throw new Error("cleanup failed");
				})}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		const button = screen.getByRole("button", { name: "Sign out" });
		await fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		await fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
	});

	it("does not clean local Household data before controller disposal finishes", async () => {
		const auth = authFixture();
		const controller = authenticatedAppSessionControllerFixture();
		const disposed = deferred<{
			householdIdsForLocalDataDeletion: string[];
		}>();
		controller.dispose.mockImplementation(() => disposed.promise);
		const clearSignedOutData = jest.fn(async () => undefined);

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(controller.dispose).toHaveBeenCalledTimes(1));
		expect(clearSignedOutData).not.toHaveBeenCalled();
		expect(auth.signOut).not.toHaveBeenCalled();
		disposed.resolve({ householdIdsForLocalDataDeletion: [] });
		await waitFor(() => expect(clearSignedOutData).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("does not call Clerk sign out before local Household data deletion finishes", async () => {
		const auth = authFixture();
		const localDataDeleted = deferred<void>();
		const clearSignedOutData = jest.fn(() => localDataDeleted.promise);

		await render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(clearSignedOutData).toHaveBeenCalledTimes(1));
		expect(auth.signOut).not.toHaveBeenCalled();
		localDataDeleted.resolve(undefined);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("continues Clerk sign out when local Household cleanup fails", async () => {
		const auth = authFixture();

		await render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={createMockAnalytics()}
				clearSignedOutSessionData={jest.fn(async () => {
					throw new Error("cleanup failed");
				})}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out local cleanup failed",
			{ error: expect.any(Error) },
		);
	});

	it("disposes the controller on provider unmount", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		const { unmount } = await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<Text>Child</Text>
			</AuthenticatedAppSessionProvider>,
		);

		await unmount();

		expect(controller.dispose).toHaveBeenCalledTimes(1);
	});
});

function CurrentState() {
	const { state, session } = useAuthenticatedAppSession();
	if (!session) return <Text>{state.status}</Text>;

	return (
		<>
			<Text>{session.activeMember.displayName}</Text>
			<Text>{session.resourceKey}</Text>
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
	// RNTL 14's fireEvent chains a promise returned from the handler, which
	// would deadlock tests that hold sign-out pending — don't return it.
	return (
		<Pressable accessibilityRole="button" onPress={() => void signOut()}>
			<Text>Sign out</Text>
		</Pressable>
	);
}

function CatchingSignOutButton() {
	const { signOut } = useAuthenticatedAppSession();
	return (
		<Pressable
			accessibilityRole="button"
			onPress={() => void signOut().catch(() => undefined)}
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
					? session.resourceKey
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
			<Text>{session ? session.resourceKey : state.status}</Text>
			<Pressable
				accessibilityRole="button"
				onPress={() => reloadSession({ mode: "retireCurrent" })}
			>
				<Text>Retire</Text>
			</Pressable>
		</>
	);
}

function AwaitableRetireSessionState() {
	const { reloadSessionAndWait } = useAuthenticatedAppSession();
	const [result, setResult] = useState("waiting");
	if (!reloadSessionAndWait) return <Text>missing reload</Text>;
	return (
		<>
			<Text>{result}</Text>
			<Pressable
				accessibilityRole="button"
				onPress={() =>
					void reloadSessionAndWait({ mode: "retireCurrent" }).then((session) =>
						setResult(session?.resourceKey ?? "missing"),
					)
				}
			>
				<Text>Await retire</Text>
			</Pressable>
		</>
	);
}

function authFixture(
	overrides: Partial<
		AuthenticatedAppSessionActivation & { signOut: () => Promise<void> }
	> = {},
): AuthenticatedAppSessionActivation & { signOut: () => Promise<void> } {
	return {
		getToken: jest.fn(async () => "token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function appSessionFixture({
	resourceKey = "authenticated-app-session:1",
}: {
	resourceKey?: string;
} = {}): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
			onboardingCompletedAt: null,
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		resourceKey,
		services: {
			lists: {
				createList: unusedSessionService,
				getList: unusedSessionService,
				renameList: unusedSessionService,
				deleteList: unusedSessionService,
				listLists: unusedSessionService,
			},
			items: {
				listItems: unusedSessionService,
				addItem: unusedSessionService,
				setItemChecked: unusedSessionService,
			},
			changes: {
				subscribe: () => ({ remove() {} }),
			},
			sync: {
				getStatus: () => "synced",
				subscribe: () => ({ remove() {} }),
				requestSync: async () => null,
			},
		},
	};
}

async function unusedSessionService(): Promise<never> {
	throw new Error("Provider tests must not call session data services");
}

function authenticatedAppSessionControllerFixture({
	snapshot = { status: "loading" },
}: {
	snapshot?: AuthenticatedAppSessionStateSnapshot;
} = {}): jest.Mocked<AuthenticatedAppSessionController> & {
	publish: (snapshot: AuthenticatedAppSessionStateSnapshot) => void;
} {
	let currentSnapshot = snapshot;
	const subscribers = new Set<
		(snapshot: AuthenticatedAppSessionStateSnapshot) => void
	>();
	return {
		activate: jest.fn<
			ReturnType<AuthenticatedAppSessionController["activate"]>,
			Parameters<AuthenticatedAppSessionController["activate"]>
		>(async () => undefined),
		dispose: jest.fn<
			ReturnType<AuthenticatedAppSessionController["dispose"]>,
			Parameters<AuthenticatedAppSessionController["dispose"]>
		>(async () => ({ householdIdsForLocalDataDeletion: [] })),
		invalidateCurrentSession: jest.fn<
			ReturnType<AuthenticatedAppSessionController["invalidateCurrentSession"]>,
			Parameters<AuthenticatedAppSessionController["invalidateCurrentSession"]>
		>(async () => {
			currentSnapshot = { status: "loading" };
			for (const subscriber of subscribers) subscriber(currentSnapshot);
		}),
		getSnapshot: jest.fn<
			ReturnType<AuthenticatedAppSessionController["getSnapshot"]>,
			Parameters<AuthenticatedAppSessionController["getSnapshot"]>
		>(() => currentSnapshot),
		subscribe: jest.fn<
			ReturnType<AuthenticatedAppSessionController["subscribe"]>,
			Parameters<AuthenticatedAppSessionController["subscribe"]>
		>((subscriber) => {
			subscribers.add(subscriber);
			return { remove: () => subscribers.delete(subscriber) };
		}),
		publish(nextSnapshot) {
			currentSnapshot = nextSnapshot;
			for (const subscriber of subscribers) subscriber(nextSnapshot);
		},
	};
}

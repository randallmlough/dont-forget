import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { useLogger } from "@/client/lib/logger";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionStateSnapshot,
} from "@/client/session";
import { deferred } from "@/test/async";
import { createMockAnalytics } from "@/test/mocks/analytics";
import { createMockLogger, type MockLogger } from "@/test/mocks/logger";
import {
	AuthenticatedAppSessionProvider,
	useAuthenticatedAppSession,
} from "./provider";

let mockLogger: MockLogger;

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>(
			"@/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
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
			getPowerSyncToken: expect.any(Function),
			authReady: true,
			signedIn: true,
			cachePolicy: "allowCached",
		});
		const activation = controller.activate.mock.calls[0]?.[0];
		await expect(activation?.getToken()).resolves.toBe("token");
		await expect(activation?.getPowerSyncToken?.()).resolves.toBe(
			"powersync-token",
		);

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

	it("signs out in analytics, controller, local cleanup, Clerk order", async () => {
		const order: string[] = [];
		const controller = authenticatedAppSessionControllerFixture();
		controller.dispose.mockImplementation(async () => {
			order.push("dispose");
		});
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerk");
			}),
		});
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => order.push("track"));
		analytics.reset.mockImplementation(() => order.push("reset"));
		const clearSessionHint = jest.fn(async () => {
			order.push("clear");
		});

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(order).toEqual(["track", "reset", "dispose", "clear", "clerk"]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(clearSessionHint).toHaveBeenCalledWith();
	});

	it("uses the latest sign-out dependencies after provider rerender", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		const auth = authFixture();
		const firstAnalytics = { track: jest.fn(), reset: jest.fn() };
		const nextAnalytics = { track: jest.fn(), reset: jest.fn() };
		const firstClearSessionHint = jest.fn(async () => undefined);
		const nextClearSessionHint = jest.fn(async () => undefined);
		const { rerender } = await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={firstAnalytics}
				clearAuthenticatedAppSessionPresent={firstClearSessionHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await rerender(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={nextAnalytics}
				clearAuthenticatedAppSessionPresent={nextClearSessionHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(firstAnalytics.track).not.toHaveBeenCalled();
		expect(firstAnalytics.reset).not.toHaveBeenCalled();
		expect(firstClearSessionHint).not.toHaveBeenCalled();
		expect(nextAnalytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(nextAnalytics.reset).toHaveBeenCalledTimes(1);
		expect(nextClearSessionHint).toHaveBeenCalledWith();
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
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
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
		const sessionHintCleared = deferred<void>();
		const clearSessionHint = jest.fn(() => sessionHintCleared.promise);

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		const signOutButton = screen.getByRole("button", { name: "Sign out" });
		await fireEvent.press(signOutButton);
		await fireEvent.press(signOutButton);

		await waitFor(() => expect(clearSessionHint).toHaveBeenCalledTimes(1));
		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(analytics.reset).toHaveBeenCalledTimes(1);
		expect(controller.dispose).toHaveBeenCalledTimes(1);
		expect(auth.signOut).not.toHaveBeenCalled();

		sessionHintCleared.resolve(undefined);
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
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
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
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
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
				clearAuthenticatedAppSessionPresent={jest.fn(async () => undefined)}
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
				clearAuthenticatedAppSessionPresent={jest.fn(async () => {
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

	it("does not run local cleanup before controller disposal finishes", async () => {
		const auth = authFixture();
		const controller = authenticatedAppSessionControllerFixture();
		const disposed = deferred<void>();
		controller.dispose.mockImplementation(() => disposed.promise);
		const clearSessionHint = jest.fn(async () => undefined);

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(controller.dispose).toHaveBeenCalledTimes(1));
		expect(clearSessionHint).not.toHaveBeenCalled();
		expect(auth.signOut).not.toHaveBeenCalled();
		disposed.resolve();
		await waitFor(() => expect(clearSessionHint).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("does not call Clerk sign out before local cleanup finishes", async () => {
		const auth = authFixture();
		const sessionHintCleared = deferred<void>();
		const clearSessionHint = jest.fn(() => sessionHintCleared.promise);

		await render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={clearSessionHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(clearSessionHint).toHaveBeenCalledTimes(1));
		expect(auth.signOut).not.toHaveBeenCalled();
		sessionHintCleared.resolve(undefined);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("continues Clerk sign out when local cleanup fails", async () => {
		const auth = authFixture();

		await render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={createMockAnalytics()}
				clearAuthenticatedAppSessionPresent={jest.fn(async () => {
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

function authFixture(
	overrides: Partial<
		AuthenticatedAppSessionActivation & { signOut: () => Promise<void> }
	> = {},
): AuthenticatedAppSessionActivation & { signOut: () => Promise<void> } {
	return {
		getToken: jest.fn(async () => "token"),
		getPowerSyncToken: jest.fn(async () => "powersync-token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function appSessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
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
		resourceKey: "authenticated-app-session:1",
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
		>(async () => undefined),
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

import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import type {
	AuthenticatedAppSessionActivation,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionStateSnapshot,
} from "@/lib/services/session";
import { authenticatedAppSessionFixture } from "@/lib/services/session/test-fixtures";
import {
	AuthenticatedAppSessionProvider,
	useAuthenticatedAppSession,
} from "./authenticated-app-session-provider";

const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
};

jest.mock("@/lib/logger", () => ({
	useLogger: () => mockLogger,
}));

jest.mock("@/lib/analytics", () => ({
	track: jest.fn(),
	reset: jest.fn(),
}));

describe("AuthenticatedAppSessionProvider", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("eagerly activates the controller and renders fresh ready state", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		render(
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
		});

		act(() => {
			controller.publish({
				status: "ready",
				session: authenticatedAppSessionFixture(),
			});
		});

		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:1")).toBeTruthy(),
		);
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("ready")).toBeTruthy();
	});

	it("does not reactivate when only the token callback identity changes", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		const firstAuth = authFixture();
		const { rerender } = render(
			<AuthenticatedAppSessionProvider controller={controller} auth={firstAuth}>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		expect(controller.activate).toHaveBeenCalledTimes(1);

		rerender(
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
		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);

		act(() => {
			controller.publish({
				status: "loading",
				previous: authenticatedAppSessionFixture(),
				refreshingSession: true,
			});
		});

		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:1")).toBeTruthy(),
		);
		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("refreshing")).toBeTruthy();
	});

	it("stops exposing ready session data while loading has no previous session", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<CurrentState />
			</AuthenticatedAppSessionProvider>,
		);
		act(() => {
			controller.publish({
				status: "ready",
				session: authenticatedAppSessionFixture(),
			});
		});
		await waitFor(() =>
			expect(screen.getByText("authenticated-app-session:1")).toBeTruthy(),
		);

		act(() => {
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
		render(
			<AuthenticatedAppSessionProvider controller={controller} auth={auth}>
				<RetryState />
			</AuthenticatedAppSessionProvider>,
		);

		expect(screen.getByText("Unable to prepare your Household.")).toBeTruthy();
		fireEvent.press(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(2));
		const [activation] = controller.activate.mock.calls.at(-1) ?? [];
		expect(activation).toMatchObject({
			authReady: true,
			signedIn: true,
		});
		await expect(activation?.getToken()).resolves.toBe("token");

		act(() => {
			controller.publish({
				status: "ready",
				session: authenticatedAppSessionFixture(),
			});
		});
		expect(screen.getByText("authenticated-app-session:1")).toBeTruthy();
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
		const analytics = {
			track: jest.fn(() => order.push("track")),
			reset: jest.fn(() => order.push("reset")),
		};
		const clearSignedOutData = jest.fn(async () => {
			order.push("clear");
		});

		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(order).toEqual(["track", "reset", "dispose", "clear", "clerk"]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(clearSignedOutData).toHaveBeenCalledWith([]);
	});

	it("passes disposed Household IDs to signed-out cleanup", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		controller.dispose.mockResolvedValue({
			householdIdsForLocalDataDeletion: ["hh_active"],
		});
		const clearSignedOutData = jest.fn(async () => undefined);

		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() =>
			expect(clearSignedOutData).toHaveBeenCalledWith(["hh_active"]),
		);
	});

	it("continues Clerk sign out when controller disposal fails", async () => {
		const controller = authenticatedAppSessionControllerFixture();
		controller.dispose.mockRejectedValue(new Error("dispose failed"));
		const auth = authFixture();

		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out dispose failed",
			{ error: expect.any(Error) },
		);
	});

	it("ignores duplicate sign-out presses while the first sign-out is pending", async () => {
		const auth = authFixture();
		const controller = authenticatedAppSessionControllerFixture();
		const analytics = { track: jest.fn(), reset: jest.fn() };
		const localDataDeleted = deferred<void>();
		const clearSignedOutData = jest.fn(() => localDataDeleted.promise);

		render(
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
		fireEvent.press(signOutButton);
		fireEvent.press(signOutButton);

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
		const { rerender } = render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		expect(controller.activate).toHaveBeenCalledTimes(1);
		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		rerender(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={{ ...auth, signedIn: false }}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
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

		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={jest.fn(async () => undefined)}
			>
				<CatchingSignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		const button = screen.getByRole("button", { name: "Sign out" });
		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(2));

		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
	});

	it("allows sign-out retry after cleanup fails and Clerk sign-out succeeds", async () => {
		const auth = authFixture();

		render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={jest.fn(async () => {
					throw new Error("cleanup failed");
				})}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		const button = screen.getByRole("button", { name: "Sign out" });
		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		fireEvent.press(button);
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

		render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

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

		render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={clearSignedOutData}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(clearSignedOutData).toHaveBeenCalledTimes(1));
		expect(auth.signOut).not.toHaveBeenCalled();
		localDataDeleted.resolve(undefined);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("continues Clerk sign out when local Household cleanup fails", async () => {
		const auth = authFixture();

		render(
			<AuthenticatedAppSessionProvider
				controller={authenticatedAppSessionControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				clearSignedOutSessionData={jest.fn(async () => {
					throw new Error("cleanup failed");
				})}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out local cleanup failed",
			{ error: expect.any(Error) },
		);
	});

	it("disposes the controller on provider unmount", () => {
		const controller = authenticatedAppSessionControllerFixture();
		const { unmount } = render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={authFixture()}
			>
				<Text>Child</Text>
			</AuthenticatedAppSessionProvider>,
		);

		unmount();

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
	return (
		<Pressable accessibilityRole="button" onPress={signOut}>
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

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

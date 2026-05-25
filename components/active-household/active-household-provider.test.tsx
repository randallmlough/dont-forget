import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import {
	activeListDataSourceFixture,
	cachedHouseholdSessionFixture,
	initialListFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";
import type {
	ActiveHouseholdActivation,
	ActiveHouseholdController,
	ActiveHouseholdSnapshot,
} from "@/lib/services/household";
import {
	ActiveHouseholdProvider,
	useActiveHousehold,
} from "./active-household-provider";

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

describe("ActiveHouseholdProvider", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("eagerly activates the controller and renders fresh ready state", async () => {
		const controller = activeHouseholdControllerFixture();
		render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={authFixture()}
				fallbackMemberName="Avery Chen"
			>
				<CurrentState />
			</ActiveHouseholdProvider>,
		);

		expect(controller.activate).toHaveBeenCalledWith({
			getToken: expect.any(Function),
			authReady: true,
			signedIn: true,
		});

		act(() => {
			controller.publish({
				status: "ready",
				view: activeHouseholdViewFixture(),
			});
		});

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
		expect(screen.getByText("Avery Chen")).toBeTruthy();
	});

	it("does not reactivate when only the token callback identity changes", async () => {
		const controller = activeHouseholdControllerFixture();
		const firstAuth = authFixture();
		const { rerender } = render(
			<ActiveHouseholdProvider controller={controller} auth={firstAuth}>
				<CurrentState />
			</ActiveHouseholdProvider>,
		);

		expect(controller.activate).toHaveBeenCalledTimes(1);

		rerender(
			<ActiveHouseholdProvider
				controller={controller}
				auth={authFixture({
					getToken: jest.fn(async () => "next-token"),
				})}
			>
				<CurrentState />
			</ActiveHouseholdProvider>,
		);

		await Promise.resolve();
		expect(controller.activate).toHaveBeenCalledTimes(1);
	});

	it("renders the previous ready state while a replacement is loading", async () => {
		const controller = activeHouseholdControllerFixture();
		render(
			<ActiveHouseholdProvider controller={controller} auth={authFixture()}>
				<CurrentState />
			</ActiveHouseholdProvider>,
		);

		act(() => {
			controller.publish({
				status: "loading",
				previous: activeHouseholdViewFixture(),
				refreshingSession: true,
			});
		});

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
		expect(screen.getByText("Avery Chen")).toBeTruthy();
	});

	it("stops exposing ready content when loading no longer has a previous view", async () => {
		const controller = activeHouseholdControllerFixture();
		render(
			<ActiveHouseholdProvider controller={controller} auth={authFixture()}>
				<CurrentState />
			</ActiveHouseholdProvider>,
		);
		act(() => {
			controller.publish({
				status: "ready",
				view: activeHouseholdViewFixture(),
			});
		});
		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());

		act(() => {
			controller.publish({ status: "loading" });
		});

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("Groceries")).toBeNull();
	});

	it("exposes error state and retries with the latest auth inputs", async () => {
		const auth = authFixture();
		const controller = activeHouseholdControllerFixture({
			snapshot: {
				status: "error",
				message: "Unable to prepare your Household.",
			},
		});
		render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={auth}
				fallbackMemberName="Avery Chen"
			>
				<RetryState />
			</ActiveHouseholdProvider>,
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
				view: activeHouseholdViewFixture(),
			});
		});
		expect(screen.getByText("Groceries")).toBeTruthy();
	});

	it("signs out in analytics, controller, local cleanup, Clerk order", async () => {
		const order: string[] = [];
		const cached = cachedHouseholdSessionFixture();
		const controller = activeHouseholdControllerFixture();
		controller.dispose.mockImplementation(async () => {
			order.push("dispose");
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
		const readCached = jest.fn(async () => cached);
		const deleteLocalData = jest.fn(async () => {
			order.push("delete");
		});
		const clearMetadata = jest.fn(async () => {
			order.push("clear");
			return cached;
		});

		render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				readCachedHouseholdSession={readCached}
				deleteCachedHouseholdSessionLocalData={deleteLocalData}
				clearCachedHouseholdSessionMetadata={clearMetadata}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		expect(order).toEqual([
			"track",
			"reset",
			"dispose",
			"delete",
			"clear",
			"clerk",
		]);
		expect(analytics.track).toHaveBeenCalledWith("user_signed_out", {});
		expect(deleteLocalData).toHaveBeenCalledWith(cached);
	});

	it("continues Clerk sign out when controller disposal fails", async () => {
		const controller = activeHouseholdControllerFixture();
		controller.dispose.mockRejectedValue(new Error("dispose failed"));
		const auth = authFixture();

		render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () => null)}
				deleteCachedHouseholdSessionLocalData={jest.fn()}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => null)}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).toHaveBeenCalledWith(
			"active Household sign-out dispose failed",
			{ error: expect.any(Error) },
		);
	});

	it("ignores duplicate sign-out presses while the first sign-out is pending", async () => {
		const cached = cachedHouseholdSessionFixture();
		const auth = authFixture();
		const controller = activeHouseholdControllerFixture();
		const analytics = { track: jest.fn(), reset: jest.fn() };
		const localDataDeleted = deferred<void>();
		const readCached = jest.fn(async () => cached);
		const deleteLocalData = jest.fn(() => localDataDeleted.promise);
		const clearMetadata = jest.fn(async () => cached);

		render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={auth}
				analytics={analytics}
				readCachedHouseholdSession={readCached}
				deleteCachedHouseholdSessionLocalData={deleteLocalData}
				clearCachedHouseholdSessionMetadata={clearMetadata}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		const signOutButton = screen.getByRole("button", { name: "Sign out" });
		fireEvent.press(signOutButton);
		fireEvent.press(signOutButton);

		await waitFor(() => expect(deleteLocalData).toHaveBeenCalledWith(cached));
		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(analytics.reset).toHaveBeenCalledTimes(1);
		expect(controller.dispose).toHaveBeenCalledTimes(1);
		expect(readCached).toHaveBeenCalledTimes(1);
		expect(deleteLocalData).toHaveBeenCalledTimes(1);
		expect(clearMetadata).not.toHaveBeenCalled();
		expect(auth.signOut).not.toHaveBeenCalled();

		localDataDeleted.resolve(undefined);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(clearMetadata).toHaveBeenCalledTimes(1);
	});

	it("skips activation runs while sign-out is in progress", async () => {
		const signOutFinished = deferred<void>();
		const controller = activeHouseholdControllerFixture();
		const auth = authFixture({
			signOut: jest.fn(() => signOutFinished.promise),
		});
		const { rerender } = render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () => null)}
				deleteCachedHouseholdSessionLocalData={jest.fn()}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => null)}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		expect(controller.activate).toHaveBeenCalledTimes(1);
		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		rerender(
			<ActiveHouseholdProvider
				controller={controller}
				auth={{ ...auth, signedIn: false }}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () => null)}
				deleteCachedHouseholdSessionLocalData={jest.fn()}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => null)}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
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

		render(
			<ActiveHouseholdProvider
				controller={activeHouseholdControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () => null)}
				deleteCachedHouseholdSessionLocalData={jest.fn()}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => null)}
			>
				<CatchingSignOutButton />
			</ActiveHouseholdProvider>,
		);

		const button = screen.getByRole("button", { name: "Sign out" });
		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
	});

	it("allows sign-out retry after cleanup fails and Clerk sign-out succeeds", async () => {
		const auth = authFixture();

		render(
			<ActiveHouseholdProvider
				controller={activeHouseholdControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () =>
					cachedHouseholdSessionFixture(),
				)}
				deleteCachedHouseholdSessionLocalData={jest.fn(async () => {
					throw new Error("delete failed");
				})}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => null)}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		const button = screen.getByRole("button", { name: "Sign out" });
		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));

		fireEvent.press(button);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
	});

	it("does not clean local Household data before controller disposal finishes", async () => {
		const cached = cachedHouseholdSessionFixture();
		const auth = authFixture();
		const controller = activeHouseholdControllerFixture();
		const disposed = deferred<void>();
		controller.dispose.mockImplementation(() => disposed.promise);
		const deleteLocalData = jest.fn(async () => undefined);

		render(
			<ActiveHouseholdProvider
				controller={controller}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () => cached)}
				deleteCachedHouseholdSessionLocalData={deleteLocalData}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => cached)}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(controller.dispose).toHaveBeenCalledTimes(1));
		expect(deleteLocalData).not.toHaveBeenCalled();
		expect(auth.signOut).not.toHaveBeenCalled();
		disposed.resolve(undefined);
		await waitFor(() => expect(deleteLocalData).toHaveBeenCalledWith(cached));
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("does not call Clerk sign out before local Household data deletion succeeds", async () => {
		const cached = cachedHouseholdSessionFixture();
		const auth = authFixture();
		const localDataDeleted = deferred<void>();
		const deleteLocalData = jest.fn(() => localDataDeleted.promise);

		render(
			<ActiveHouseholdProvider
				controller={activeHouseholdControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () => cached)}
				deleteCachedHouseholdSessionLocalData={deleteLocalData}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => cached)}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(deleteLocalData).toHaveBeenCalledWith(cached));
		expect(auth.signOut).not.toHaveBeenCalled();
		localDataDeleted.resolve(undefined);
		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
	});

	it("continues Clerk sign out when local Household cleanup fails", async () => {
		const auth = authFixture();
		const clearMetadata = jest.fn(async () => null);

		render(
			<ActiveHouseholdProvider
				controller={activeHouseholdControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () =>
					cachedHouseholdSessionFixture(),
				)}
				deleteCachedHouseholdSessionLocalData={jest.fn(async () => {
					throw new Error("delete failed");
				})}
				clearCachedHouseholdSessionMetadata={clearMetadata}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(clearMetadata).toHaveBeenCalledTimes(1);
		expect(mockLogger.error).toHaveBeenCalledWith(
			"active Household sign-out local cleanup failed",
			{ error: expect.any(Error) },
		);
	});

	it("continues Clerk sign out when cached Household metadata clearing fails", async () => {
		const auth = authFixture();

		render(
			<ActiveHouseholdProvider
				controller={activeHouseholdControllerFixture()}
				auth={auth}
				analytics={{ track: jest.fn(), reset: jest.fn() }}
				readCachedHouseholdSession={jest.fn(async () =>
					cachedHouseholdSessionFixture(),
				)}
				deleteCachedHouseholdSessionLocalData={jest.fn(async () => undefined)}
				clearCachedHouseholdSessionMetadata={jest.fn(async () => {
					throw new Error("clear failed");
				})}
			>
				<SignOutButton />
			</ActiveHouseholdProvider>,
		);

		fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
		expect(mockLogger.error).toHaveBeenCalledWith(
			"active Household sign-out local cleanup failed",
			{ error: expect.any(Error) },
		);
	});

	it("disposes the controller on provider unmount", () => {
		const controller = activeHouseholdControllerFixture();
		const { unmount } = render(
			<ActiveHouseholdProvider controller={controller} auth={authFixture()}>
				<Text>Child</Text>
			</ActiveHouseholdProvider>,
		);

		unmount();

		expect(controller.dispose).toHaveBeenCalledTimes(1);
	});
});

function CurrentState() {
	const { content } = useActiveHousehold();
	if (content.status !== "ready") return <Text>{content.status}</Text>;

	return (
		<>
			<Text>{content.activeMemberName}</Text>
			<Text>{content.initialList.listName}</Text>
		</>
	);
}

function SignOutButton() {
	const { signOut } = useActiveHousehold();
	return (
		<Pressable accessibilityRole="button" onPress={signOut}>
			<Text>Sign out</Text>
		</Pressable>
	);
}

function CatchingSignOutButton() {
	const { signOut } = useActiveHousehold();
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
	const { content, retry } = useActiveHousehold();
	return (
		<>
			<Text>
				{content.status === "ready"
					? content.initialList.listName
					: content.status === "error"
						? content.message
						: content.status}
			</Text>
			<Pressable accessibilityRole="button" onPress={retry}>
				<Text>Retry</Text>
			</Pressable>
		</>
	);
}

function authFixture(
	overrides: Partial<
		ActiveHouseholdActivation & { signOut: () => Promise<void> }
	> = {},
): ActiveHouseholdActivation & { signOut: () => Promise<void> } {
	return {
		getToken: jest.fn(async () => "token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function activeHouseholdControllerFixture({
	snapshot = { status: "loading" },
}: {
	snapshot?: ActiveHouseholdSnapshot;
} = {}): jest.Mocked<ActiveHouseholdController> & {
	publish: (snapshot: ActiveHouseholdSnapshot) => void;
} {
	let currentSnapshot = snapshot;
	const subscribers = new Set<(snapshot: ActiveHouseholdSnapshot) => void>();
	return {
		activate: jest.fn<
			ReturnType<ActiveHouseholdController["activate"]>,
			Parameters<ActiveHouseholdController["activate"]>
		>(async () => undefined),
		dispose: jest.fn<
			ReturnType<ActiveHouseholdController["dispose"]>,
			Parameters<ActiveHouseholdController["dispose"]>
		>(async () => undefined),
		getSnapshot: jest.fn<
			ReturnType<ActiveHouseholdController["getSnapshot"]>,
			Parameters<ActiveHouseholdController["getSnapshot"]>
		>(() => currentSnapshot),
		subscribe: jest.fn<
			ReturnType<ActiveHouseholdController["subscribe"]>,
			Parameters<ActiveHouseholdController["subscribe"]>
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

function activeHouseholdViewFixture() {
	return {
		activeMemberName: "Avery Chen",
		currentList: {
			resourceKey: "current-list:1",
			initialState: initialListFixture({ items: [] }),
			dataSource: activeListDataSourceFixture(),
			syncCoordinator: syncCoordinatorFixture(),
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

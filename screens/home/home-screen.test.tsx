import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";

import type {
	ActiveListDataSource,
	ActiveListInitialState,
} from "@/components/active-list";
import { reset, track } from "@/lib/analytics";
import {
	type CachedHouseholdSession,
	clearCachedHouseholdSession,
	discardCachedHouseholdSessionIfUnauthorized,
	getHouseholdSession,
	readCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";
import { clerkMocks, setMockAuthState } from "@/lib/test/mocks/clerk";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

import { createHouseholdActiveListDataSource } from "./active-list-data-source";

jest.mock("@/lib/analytics", () => ({
	reset: jest.fn(),
	track: jest.fn(),
}));

jest.mock("./active-list-data-source", () => ({
	createHouseholdActiveListDataSource: jest.fn(),
}));

jest.mock("@/lib/services/household", () => ({
	clearCachedHouseholdSession: jest.fn(),
	createHouseholdSyncCoordinator: jest.fn(
		(deps: {
			syncAuthorized: boolean;
			sync: (options?: { mode?: "full" | "pushLocalOnly" }) => Promise<{
				changed: boolean;
			}>;
		}) => ({
			getStatus: () => (deps.syncAuthorized ? "synced" : "offline"),
			subscribe: jest.fn(() => ({ remove() {} })),
			start: jest.fn(),
			stop: jest.fn(),
			requestSync: jest.fn(async ({ reason }: { reason: string }) => {
				if (!deps.syncAuthorized) return null;
				return deps.sync(
					reason === "manualRefresh" ? undefined : { mode: "pushLocalOnly" },
				);
			}),
		}),
	),
	discardCachedHouseholdSessionIfUnauthorized: jest.fn(),
	getHouseholdSession: jest.fn(),
	readCachedHouseholdSession: jest.fn(),
	saveCachedHouseholdSession: jest.fn(),
}));

beforeEach(() => {
	jest.mocked(track).mockReset();
	jest.mocked(reset).mockReset();
	jest.mocked(getHouseholdSession).mockReset();
	jest.mocked(createHouseholdActiveListDataSource).mockReset();
	jest.mocked(clearCachedHouseholdSession).mockResolvedValue(undefined);
	jest
		.mocked(discardCachedHouseholdSessionIfUnauthorized)
		.mockResolvedValue(null);
	jest.mocked(readCachedHouseholdSession).mockResolvedValue(null);
	jest
		.mocked(saveCachedHouseholdSession)
		.mockResolvedValue(cachedHouseholdSessionFixture());
});

describe("HomeScreen", () => {
	it("closes a data source that is still loading when Home unmounts", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest
			.mocked(getHouseholdSession)
			.mockResolvedValue(householdSessionFixture());
		jest.mocked(createHouseholdActiveListDataSource).mockReturnValue({
			syncAuthorized: true,
			async load() {
				return load.promise;
			},
			async addItem(name) {
				return {
					id: "itm_new",
					name,
					checked: false,
					checkedByMemberName: null,
				};
			},
			async setItemChecked() {},
			async pull() {
				return { changed: false };
			},
			async sync() {
				return { changed: false };
			},
			close,
		});
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		const { unmount } = render(<HomeScreen />);

		await waitFor(() =>
			expect(createHouseholdActiveListDataSource).toHaveBeenCalledTimes(1),
		);
		unmount();

		expect(close).toHaveBeenCalledTimes(1);
		load.resolve(initialListFixture());
	});

	it("renders cached local List data while a fresh Household Session is still pending", async () => {
		const freshSession = deferred<ReturnType<typeof householdSessionFixture>>();
		const cached = cachedHouseholdSessionFixture();
		const cachedList = initialListFixture({ itemName: "Cached Milk" });
		const freshList = initialListFixture({ itemName: "Fresh Eggs" });
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListDataSource)
			.mockImplementation((config) => {
				return config.database.authToken
					? noopDataSource(freshList, { syncAuthorized: true })
					: noopDataSource(cachedList, { syncAuthorized: false });
			});
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		expect(screen.queryByText("Preparing your Household")).toBeNull();
		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
		expect(getHouseholdSession).toHaveBeenCalledTimes(1);
		expect(createHouseholdActiveListDataSource).toHaveBeenCalledWith({
			household: cached.activeHousehold,
			activeMember: cached.activeMember,
			list: cached.activeList,
			currentUser: cached.user,
			members: cached.members,
			database: cached.householdDatabase,
		});

		await act(async () => {
			freshSession.resolve(householdSessionFixture());
		});

		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
		expect(saveCachedHouseholdSession).toHaveBeenCalledWith(
			householdSessionFixture(),
		);
	});

	it("reopens cached local List data without a cached DB auth token when fresh Household Session loading fails", async () => {
		const initialList = initialListFixture();
		const cached = cachedHouseholdSessionFixture();
		jest.mocked(getHouseholdSession).mockRejectedValue(new Error("offline"));
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListDataSource)
			.mockReturnValue(noopDataSource(initialList));
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(createHouseholdActiveListDataSource).toHaveBeenCalledWith({
			household: cached.activeHousehold,
			activeMember: cached.activeMember,
			list: cached.activeList,
			currentUser: cached.user,
			members: cached.members,
			database: cached.householdDatabase,
		});
		expect(Object.hasOwn(cached.householdDatabase, "authToken")).toBe(false);
		expect(saveCachedHouseholdSession).not.toHaveBeenCalled();
	});

	it("reopens cached local List data when Clerk reports signed out during offline relaunch", async () => {
		const initialList = initialListFixture();
		const cached = cachedHouseholdSessionFixture();
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListDataSource)
			.mockReturnValue(noopDataSource(initialList, { syncAuthorized: false }));
		setMockAuthState({ isSignedIn: false });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(getHouseholdSession).not.toHaveBeenCalled();
		expect(createHouseholdActiveListDataSource).toHaveBeenCalledWith({
			household: cached.activeHousehold,
			activeMember: cached.activeMember,
			list: cached.activeList,
			currentUser: cached.user,
			members: cached.members,
			database: cached.householdDatabase,
		});
		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
	});

	it("reopens cached local List data before Clerk finishes loading during offline relaunch", async () => {
		const initialList = initialListFixture();
		const cached = cachedHouseholdSessionFixture();
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListDataSource)
			.mockReturnValue(noopDataSource(initialList, { syncAuthorized: false }));
		setMockAuthState({ isLoaded: false, isSignedIn: false });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(getHouseholdSession).not.toHaveBeenCalled();
		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
	});

	it("discards stale cached Household metadata before opening fresh authorized data", async () => {
		const initialList = initialListFixture();
		const session = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		jest.mocked(getHouseholdSession).mockResolvedValue(session);
		jest
			.mocked(createHouseholdActiveListDataSource)
			.mockReturnValue(noopDataSource(initialList));
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(discardCachedHouseholdSessionIfUnauthorized).toHaveBeenCalledWith(
			session,
		);
		expect(createHouseholdActiveListDataSource).toHaveBeenCalledWith({
			household: session.activeHousehold,
			activeMember: session.activeMember,
			list: session.activeList,
			currentUser: session.user,
			members: session.members,
			database: session.householdDatabase,
		});
		expect(saveCachedHouseholdSession).toHaveBeenCalledWith(session);
	});

	it("tracks, resets, clears local Household data, then signs out through Clerk", async () => {
		const calls: string[] = [];
		const initialList = initialListFixture();
		const close = jest.fn(async () => {
			calls.push("close-data-source");
		});
		jest
			.mocked(getHouseholdSession)
			.mockResolvedValue(householdSessionFixture());
		jest.mocked(createHouseholdActiveListDataSource).mockReturnValue({
			...noopDataSource(initialList),
			close,
		});
		jest.mocked(track).mockImplementation(() => {
			calls.push("track");
		});
		jest.mocked(reset).mockImplementation(() => {
			calls.push("reset");
		});
		jest.mocked(clearCachedHouseholdSession).mockImplementation(async () => {
			calls.push("clear-local-household-data");
		});
		clerkMocks.signOut.mockImplementation(async () => {
			calls.push("clerk-sign-out");
		});
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		fireEvent.press(screen.getByText("Sign out"));

		await waitFor(() => expect(clerkMocks.signOut).toHaveBeenCalledTimes(1));
		expect(calls).toEqual([
			"track",
			"reset",
			"close-data-source",
			"clear-local-household-data",
			"clerk-sign-out",
		]);
	});
});

describe("HomeScreenView", () => {
	it("shows Household Session loading and retryable error states", () => {
		const retry = jest.fn();

		const { rerender } = render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{ status: "loading" }}
			/>,
		);
		expect(screen.getByText("Preparing your Household")).toBeTruthy();

		rerender(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "error",
					message: "Unable to prepare your Household. Please try again.",
				}}
				onRetry={retry}
			/>,
		);

		fireEvent.press(screen.getByText("Try again"));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("renders Active List data after Household Session loading succeeds", () => {
		const initialList = initialListFixture();

		render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					initialList,
					dataSource: noopDataSource(initialList),
				}}
			/>,
		);

		expect(screen.getByText("Avery")).toBeTruthy();
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
	});
});

function householdSessionFixture(
	overrides: { householdId?: string; householdName?: string } = {},
) {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: {
			id: overrides.householdId ?? "hh_avery",
			name: overrides.householdName ?? "Avery",
		},
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
			authToken: "token",
			expiresAt: 1,
		},
	};
}

function cachedHouseholdSessionFixture(): CachedHouseholdSession {
	const { householdDatabase: _householdDatabase, ...sessionMetadata } =
		householdSessionFixture();

	return {
		...sessionMetadata,
		householdDatabase: {
			url: "libsql://example.turso.io",
			expiresAt: 1,
		},
		initializedAt: 1_700_000_000_000,
	};
}

function initialListFixture(
	overrides: { itemName?: string } = {},
): ActiveListInitialState {
	return {
		householdName: "Avery",
		listName: "Groceries",
		items: [
			{
				id: "itm_milk",
				name: overrides.itemName ?? "Milk",
				checked: true,
				checkedByMemberName: "Avery Chen",
			},
		],
	};
}

function noopDataSource(
	initialList: ActiveListInitialState,
	overrides: Partial<ActiveListDataSource> = {},
): ActiveListDataSource {
	return {
		syncAuthorized: false,
		async load() {
			return initialList;
		},
		async addItem(name) {
			return { id: "itm_new", name, checked: false, checkedByMemberName: null };
		},
		async setItemChecked() {},
		async pull() {
			return { changed: false };
		},
		async sync() {
			return { changed: false };
		},
		async close() {},
		...overrides,
	};
}

function deferred<T>() {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});
	if (!resolve) {
		throw new Error("Unable to create deferred promise");
	}

	return { promise, resolve };
}

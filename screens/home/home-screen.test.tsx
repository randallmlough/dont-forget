import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";

import type {
	ActiveListDataAdapter,
	ActiveListInitialState,
} from "@/components/active-list";
import { reset, track } from "@/lib/analytics";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import {
	type CachedBootstrapMetadata,
	clearCachedHouseholdSession,
	discardCachedBootstrapMetadataIfUnauthorized,
	readCachedBootstrapMetadata,
	saveCachedBootstrapMetadata,
} from "@/lib/app/offline-bootstrap-cache";
import { clerkMocks, setMockAuthState } from "@/lib/test/mocks/clerk";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

jest.mock("@/lib/analytics", () => ({
	reset: jest.fn(),
	track: jest.fn(),
}));

jest.mock("@/lib/app/bootstrap-client", () => ({
	bootstrapWithClerk: jest.fn(),
}));

jest.mock("@/lib/app/active-list-adapter", () => ({
	createHouseholdActiveListAdapter: jest.fn(),
}));

jest.mock("@/lib/app/offline-bootstrap-cache", () => ({
	clearCachedHouseholdSession: jest.fn(),
	discardCachedBootstrapMetadataIfUnauthorized: jest.fn(),
	readCachedBootstrapMetadata: jest.fn(),
	saveCachedBootstrapMetadata: jest.fn(),
}));

beforeEach(() => {
	jest.mocked(track).mockReset();
	jest.mocked(reset).mockReset();
	jest.mocked(bootstrapWithClerk).mockReset();
	jest.mocked(createHouseholdActiveListAdapter).mockReset();
	jest.mocked(clearCachedHouseholdSession).mockResolvedValue(undefined);
	jest
		.mocked(discardCachedBootstrapMetadataIfUnauthorized)
		.mockResolvedValue(null);
	jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(null);
	jest
		.mocked(saveCachedBootstrapMetadata)
		.mockResolvedValue(cachedBootstrapFixture());
});

describe("HomeScreen", () => {
	it("closes an adapter that is still loading when Home unmounts", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrapFixture());
		jest.mocked(createHouseholdActiveListAdapter).mockReturnValue({
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
			expect(createHouseholdActiveListAdapter).toHaveBeenCalledTimes(1),
		);
		unmount();

		expect(close).toHaveBeenCalledTimes(1);
		load.resolve(initialListFixture());
	});

	it("renders cached local List data while bootstrap is still pending", async () => {
		const bootstrap = deferred<ReturnType<typeof bootstrapFixture>>();
		const cached = cachedBootstrapFixture();
		const cachedList = initialListFixture({ itemName: "Cached Milk" });
		const freshList = initialListFixture({ itemName: "Fresh Eggs" });
		jest.mocked(bootstrapWithClerk).mockReturnValue(bootstrap.promise);
		jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockImplementation((config) => {
				return config.database.authToken
					? noopAdapter(freshList)
					: noopAdapter(cachedList, { syncAuthorized: false });
			});
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		expect(screen.queryByText("Preparing your Household")).toBeNull();
		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
		expect(bootstrapWithClerk).toHaveBeenCalledTimes(1);
		expect(createHouseholdActiveListAdapter).toHaveBeenCalledWith({
			household: cached.activeHousehold,
			activeMember: cached.activeMember,
			list: cached.activeList,
			currentUser: cached.user,
			members: cached.members,
			database: cached.householdDatabase,
		});

		await act(async () => {
			bootstrap.resolve(bootstrapFixture());
		});

		await waitFor(() => expect(screen.getByText("Synced")).toBeTruthy());
		expect(saveCachedBootstrapMetadata).toHaveBeenCalledWith(
			bootstrapFixture(),
		);
	});

	it("reopens cached local List data without a cached DB auth token when bootstrap fails", async () => {
		const initialList = initialListFixture();
		const cached = cachedBootstrapFixture();
		jest.mocked(bootstrapWithClerk).mockRejectedValue(new Error("offline"));
		jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockReturnValue(noopAdapter(initialList));
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(createHouseholdActiveListAdapter).toHaveBeenCalledWith({
			household: cached.activeHousehold,
			activeMember: cached.activeMember,
			list: cached.activeList,
			currentUser: cached.user,
			members: cached.members,
			database: cached.householdDatabase,
		});
		expect(Object.hasOwn(cached.householdDatabase, "authToken")).toBe(false);
		expect(saveCachedBootstrapMetadata).not.toHaveBeenCalled();
	});

	it("reopens cached local List data when Clerk reports signed out during offline relaunch", async () => {
		const initialList = initialListFixture();
		const cached = cachedBootstrapFixture();
		jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockReturnValue(noopAdapter(initialList, { syncAuthorized: false }));
		setMockAuthState({ isSignedIn: false });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(bootstrapWithClerk).not.toHaveBeenCalled();
		expect(createHouseholdActiveListAdapter).toHaveBeenCalledWith({
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
		const cached = cachedBootstrapFixture();
		jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockReturnValue(noopAdapter(initialList, { syncAuthorized: false }));
		setMockAuthState({ isLoaded: false, isSignedIn: false });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(bootstrapWithClerk).not.toHaveBeenCalled();
		expect(screen.getByText("Offline - changes saved locally")).toBeTruthy();
	});

	it("discards stale cached Household metadata before opening fresh authorized data", async () => {
		const initialList = initialListFixture();
		const bootstrap = bootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrap);
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockReturnValue(noopAdapter(initialList));
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(discardCachedBootstrapMetadataIfUnauthorized).toHaveBeenCalledWith(
			bootstrap,
		);
		expect(createHouseholdActiveListAdapter).toHaveBeenCalledWith({
			household: bootstrap.activeHousehold,
			activeMember: bootstrap.activeMember,
			list: bootstrap.activeList,
			currentUser: bootstrap.user,
			members: bootstrap.members,
			database: bootstrap.householdDatabase,
		});
		expect(saveCachedBootstrapMetadata).toHaveBeenCalledWith(bootstrap);
	});

	it("tracks, resets, clears local Household data, then signs out through Clerk", async () => {
		const calls: string[] = [];
		const initialList = initialListFixture();
		const close = jest.fn(async () => {
			calls.push("close-adapter");
		});
		jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrapFixture());
		jest.mocked(createHouseholdActiveListAdapter).mockReturnValue({
			...noopAdapter(initialList),
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
			"close-adapter",
			"clear-local-household-data",
			"clerk-sign-out",
		]);
	});
});

describe("HomeScreenView", () => {
	it("shows bootstrap loading and retryable error states", () => {
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

	it("renders Active List data after bootstrap succeeds", () => {
		const initialList = initialListFixture();

		render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					initialList,
					adapter: noopAdapter(initialList),
				}}
			/>,
		);

		expect(screen.getByText("Avery")).toBeTruthy();
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
	});
});

function bootstrapFixture(
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

function cachedBootstrapFixture(): CachedBootstrapMetadata {
	const { householdDatabase: _householdDatabase, ...bootstrap } =
		bootstrapFixture();

	return {
		...bootstrap,
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

function noopAdapter(
	initialList: ActiveListInitialState,
	overrides: Partial<ActiveListDataAdapter> = {},
): ActiveListDataAdapter {
	return {
		syncAuthorized: true,
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

import { render, screen, waitFor } from "@testing-library/react-native";
import { useRef } from "react";
import { Text } from "react-native";

import type {
	ActiveListDataSource,
	ActiveListInitialState,
} from "@/components/active-list";
import { useLogger } from "@/lib/logger";
import {
	type CachedHouseholdSession,
	clearUnauthorizedCachedHouseholdSessionMetadata,
	createHouseholdCurrentListDataSource,
	deleteCachedHouseholdSessionLocalData,
	getHouseholdSession,
	type HouseholdSession,
	readCachedHouseholdSession,
	readUnauthorizedCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";
import { createDefaultSyncCoordinator } from "@/lib/services/sync";
import { useHomeContent } from "@/screens/home/use-home-content";

import { mockSyncCoordinatorFactory } from "./test-sync-coordinator";

const mockHouseholdLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
};
const mockRootLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(() => mockHouseholdLogger),
};

jest.mock("@/lib/logger", () => ({
	useLogger: jest.fn(() => mockRootLogger),
}));

jest.mock("@/lib/services/household", () => ({
	clearUnauthorizedCachedHouseholdSessionMetadata: jest.fn(),
	createHouseholdCurrentListDataSource: jest.fn(),
	deleteCachedHouseholdSessionLocalData: jest.fn(),
	getHouseholdSession: jest.fn(),
	readCachedHouseholdSession: jest.fn(),
	readUnauthorizedCachedHouseholdSession: jest.fn(),
	saveCachedHouseholdSession: jest.fn(),
}));

jest.mock("@/lib/services/sync", () => ({
	createDefaultSyncCoordinator: jest.requireActual<
		typeof import("./test-sync-coordinator")
	>("./test-sync-coordinator").mockSyncCoordinatorFactory
		.createDefaultSyncCoordinator,
}));

beforeEach(() => {
	jest.mocked(getHouseholdSession).mockReset();
	jest.mocked(createDefaultSyncCoordinator).mockClear();
	jest.mocked(createHouseholdCurrentListDataSource).mockReset();
	mockSyncCoordinatorFactory.created.length = 0;
	jest.mocked(useLogger).mockReturnValue(mockRootLogger);
	mockRootLogger.with.mockClear();
	mockRootLogger.with.mockImplementation(() => mockHouseholdLogger);
	jest
		.mocked(clearUnauthorizedCachedHouseholdSessionMetadata)
		.mockResolvedValue(undefined);
	jest
		.mocked(deleteCachedHouseholdSessionLocalData)
		.mockResolvedValue(undefined);
	jest.mocked(readUnauthorizedCachedHouseholdSession).mockResolvedValue(null);
	jest.mocked(readCachedHouseholdSession).mockResolvedValue(null);
	jest
		.mocked(saveCachedHouseholdSession)
		.mockResolvedValue(cachedHouseholdSessionFixture());
});

describe("useHomeContent", () => {
	it("does not restart Household Session loading when the getToken callback changes", async () => {
		const session = householdSessionFixture();
		const getToken = jest.fn(async () => "session-token");
		const nextGetToken = jest.fn(async () => "next-session-token");
		jest.mocked(getHouseholdSession).mockImplementation(async (loadToken) => {
			await loadToken();
			return session;
		});
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockReturnValue(noopDataSource(initialListFixture()));

		const { rerender } = render(
			<UseHomeContentHarness getToken={getToken} isLoaded isSignedIn />,
		);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		rerender(
			<UseHomeContentHarness getToken={nextGetToken} isLoaded isSignedIn />,
		);

		expect(getHouseholdSession).toHaveBeenCalledTimes(1);
		expect(getToken).toHaveBeenCalledTimes(1);
		expect(nextGetToken).not.toHaveBeenCalled();
	});

	it("does not restart Household Session loading when logger identity changes", async () => {
		const session = householdSessionFixture();
		jest.mocked(getHouseholdSession).mockResolvedValue(session);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockReturnValue(noopDataSource(initialListFixture()));

		const { rerender } = render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		jest.mocked(useLogger).mockReturnValue({
			...mockRootLogger,
			with: jest.fn(() => mockHouseholdLogger),
		});
		rerender(<UseHomeContentHarness isLoaded isSignedIn />);

		expect(getHouseholdSession).toHaveBeenCalledTimes(1);
	});

	it("scopes the sync coordinator logger to the active Household", async () => {
		const session = householdSessionFixture({ householdId: "hh_new" });
		jest.mocked(getHouseholdSession).mockResolvedValue(session);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockReturnValue(noopDataSource(initialListFixture()));

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		expect(mockRootLogger.with).toHaveBeenCalledWith({
			household_id: "hh_new",
		});
		expect(createDefaultSyncCoordinator).toHaveBeenCalledWith(
			expect.objectContaining({
				logger: mockHouseholdLogger,
			}),
		);
	});

	it("opens cached local List data before Clerk finishes loading", async () => {
		const cached = cachedHouseholdSessionFixture();
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockReturnValue(
				noopDataSource(initialListFixture(), { syncAuthorized: false }),
			);

		render(<UseHomeContentHarness isLoaded={false} isSignedIn={false} />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(getHouseholdSession).not.toHaveBeenCalled();
		expect(createHouseholdCurrentListDataSource).toHaveBeenCalledWith({
			household: cached.activeHousehold,
			activeMember: cached.activeMember,
			list: cached.activeList,
			currentUser: cached.user,
			members: cached.members,
			database: cached.householdDatabase,
		});
	});

	it("closes rendered cached List data before opening fresh authorized data", async () => {
		const calls: string[] = [];
		const freshSession = deferred<HouseholdSession>();
		const cached = cachedHouseholdSessionFixture();
		const cachedList = initialListFixture({ itemName: "Cached Milk" });
		const freshList = initialListFixture({ itemName: "Fresh Eggs" });
		const cachedDataSource = noopDataSource(cachedList, {
			syncAuthorized: false,
			async load() {
				calls.push("cached-load");
				return cachedList;
			},
			async close() {
				calls.push("cached-close");
			},
		});
		const freshDataSource = noopDataSource(freshList, {
			async load() {
				calls.push("fresh-load");
				return freshList;
			},
		});
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockImplementation((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			);

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		mockSyncCoordinatorFactory.created[0]?.stop.mockImplementation(() => {
			calls.push("cached-stop");
			return Promise.resolve();
		});

		freshSession.resolve(householdSessionFixture());

		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
		expect(calls.indexOf("cached-stop")).toBeGreaterThanOrEqual(0);
		expect(calls.indexOf("cached-stop")).toBeLessThan(
			calls.indexOf("cached-close"),
		);
		expect(calls.indexOf("cached-close")).toBeGreaterThanOrEqual(0);
		expect(calls.indexOf("cached-close")).toBeLessThan(
			calls.indexOf("fresh-load"),
		);
	});

	it("closes rendered cached List data before replacing it with another cached render", async () => {
		const cached = cachedHouseholdSessionFixture();
		const calls: string[] = [];
		const firstCachedDataSource = noopDataSource(
			initialListFixture({ itemName: "Cached Milk" }),
			{
				async close() {
					calls.push("first-cached-close");
				},
			},
		);
		const secondCachedDataSource = noopDataSource(
			initialListFixture({ itemName: "Cached Eggs" }),
			{
				async close() {
					calls.push("second-cached-close");
				},
			},
		);
		const freshSession = deferred<HouseholdSession>();
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockReturnValueOnce(firstCachedDataSource)
			.mockReturnValueOnce(secondCachedDataSource);

		const { rerender } = render(
			<UseHomeContentHarness isLoaded={false} isSignedIn={false} />,
		);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		mockSyncCoordinatorFactory.created[0]?.stop.mockImplementation(async () => {
			calls.push("first-cached-stop");
		});

		rerender(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Cached Eggs")).toBeTruthy());
		expect(calls).toEqual(["first-cached-stop", "first-cached-close"]);
	});

	it("resumes authorized sync after replacing cached local Home data with a fresh Household Session", async () => {
		const freshSession = deferred<HouseholdSession>();
		const cached = cachedHouseholdSessionFixture();
		const cachedList = initialListFixture({ itemName: "Cached Milk" });
		const freshList = initialListFixture({ itemName: "Fresh Eggs" });
		const cachedSync = jest.fn(async () => ({ changed: false }));
		const freshSync = jest.fn(async () => ({ changed: false }));
		const cachedDataSource = noopDataSource(cachedList, {
			syncAuthorized: false,
			sync: cachedSync,
		});
		const freshDataSource = noopDataSource(freshList, {
			syncAuthorized: true,
			sync: freshSync,
		});
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockImplementation((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			);

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		expect(cachedSync).not.toHaveBeenCalled();

		freshSession.resolve(householdSessionFixture());

		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
		expect(cachedSync).not.toHaveBeenCalled();
		expect(freshSync).not.toHaveBeenCalled();
		expect(mockSyncCoordinatorFactory.created[0]?.start).not.toHaveBeenCalled();
		expect(mockSyncCoordinatorFactory.created[1]?.start).toHaveBeenCalledTimes(
			1,
		);
	});

	it("discards unauthorized cached Household data without starting cached sync", async () => {
		const calls: string[] = [];
		const freshSession = deferred<HouseholdSession>();
		const cached = cachedHouseholdSessionFixture();
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedList = initialListFixture({ itemName: "Cached Milk" });
		const freshList = initialListFixture({ itemName: "Fresh Eggs" });
		const cachedSync = jest.fn(async () => ({ changed: false }));
		const freshSync = jest.fn(async () => ({ changed: false }));
		const cachedDataSource = noopDataSource(cachedList, {
			syncAuthorized: false,
			sync: cachedSync,
			async close() {
				calls.push("cached-close");
			},
		});
		const freshDataSource = noopDataSource(freshList, {
			syncAuthorized: true,
			sync: freshSync,
		});
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(readUnauthorizedCachedHouseholdSession)
			.mockResolvedValue(cached);
		jest
			.mocked(clearUnauthorizedCachedHouseholdSessionMetadata)
			.mockImplementation(async () => {
				calls.push("clear-unauthorized-metadata");
			});
		jest
			.mocked(deleteCachedHouseholdSessionLocalData)
			.mockImplementation(async () => {
				calls.push("delete-local-data");
			});
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockImplementation((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			);

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		mockSyncCoordinatorFactory.created[0]?.stop.mockImplementation(async () => {
			calls.push("cached-stop");
		});
		freshSession.resolve(fresh);

		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
		expect(readUnauthorizedCachedHouseholdSession).toHaveBeenCalledWith(fresh);
		expect(
			clearUnauthorizedCachedHouseholdSessionMetadata,
		).toHaveBeenCalledWith(cached, fresh);
		expect(deleteCachedHouseholdSessionLocalData).toHaveBeenCalledWith(cached);
		expect(calls).toEqual([
			"cached-stop",
			"cached-close",
			"delete-local-data",
			"clear-unauthorized-metadata",
		]);
		expect(cachedSync).not.toHaveBeenCalled();
		expect(mockSyncCoordinatorFactory.created[0]?.start).not.toHaveBeenCalled();
		expect(freshSync).not.toHaveBeenCalled();
		expect(mockSyncCoordinatorFactory.created[1]?.start).toHaveBeenCalledTimes(
			1,
		);
	});

	it("closes pending unauthorized cached resources before clearing metadata or deleting local data", async () => {
		const calls: string[] = [];
		const cachedLoad = deferred<ActiveListInitialState>();
		const freshSession = deferred<HouseholdSession>();
		const cached = cachedHouseholdSessionFixture();
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshList = initialListFixture({ itemName: "Fresh Eggs" });
		const cachedDataSource = noopDataSource(initialListFixture(), {
			syncAuthorized: false,
			load: () => cachedLoad.promise,
			async close() {
				calls.push("pending-cached-close");
			},
		});
		const freshDataSource = noopDataSource(freshList, {
			syncAuthorized: true,
		});
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(readUnauthorizedCachedHouseholdSession)
			.mockResolvedValue(cached);
		jest
			.mocked(clearUnauthorizedCachedHouseholdSessionMetadata)
			.mockImplementation(async () => {
				calls.push("clear-unauthorized-metadata");
			});
		jest
			.mocked(deleteCachedHouseholdSessionLocalData)
			.mockImplementation(async () => {
				calls.push("delete-local-data");
			});
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockImplementation((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			);

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() =>
			expect(createHouseholdCurrentListDataSource).toHaveBeenCalledTimes(1),
		);
		mockSyncCoordinatorFactory.created[0]?.stop.mockImplementation(async () => {
			calls.push("pending-cached-stop");
		});
		freshSession.resolve(fresh);

		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
		expect(calls).toEqual([
			"pending-cached-stop",
			"pending-cached-close",
			"delete-local-data",
			"clear-unauthorized-metadata",
		]);
	});

	it("does not delete unauthorized cached local data when cached resources fail to close", async () => {
		const freshSession = deferred<HouseholdSession>();
		const cached = cachedHouseholdSessionFixture();
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataSource = noopDataSource(
			initialListFixture({ itemName: "Cached Milk" }),
			{ syncAuthorized: false },
		);
		const freshDataSource = noopDataSource(
			initialListFixture({ itemName: "Fresh Eggs" }),
			{ syncAuthorized: true },
		);
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(readUnauthorizedCachedHouseholdSession)
			.mockResolvedValue(cached);
		jest
			.mocked(createHouseholdCurrentListDataSource)
			.mockImplementation((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			);

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		mockSyncCoordinatorFactory.created[0]?.stop.mockRejectedValue(
			new Error("stop failed"),
		);
		freshSession.resolve(fresh);

		await waitFor(() => expect(screen.getByText("error")).toBeTruthy());
		expect(deleteCachedHouseholdSessionLocalData).not.toHaveBeenCalled();
		expect(
			clearUnauthorizedCachedHouseholdSessionMetadata,
		).not.toHaveBeenCalled();
		expect(screen.queryByText("Fresh Eggs")).toBeNull();
	});

	it("closes a pending data source when the loading run is cancelled", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest
			.mocked(getHouseholdSession)
			.mockResolvedValue(householdSessionFixture());
		jest.mocked(createHouseholdCurrentListDataSource).mockReturnValue({
			...noopDataSource(initialListFixture()),
			load: () => load.promise,
			close,
		});

		const { unmount } = render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() =>
			expect(createHouseholdCurrentListDataSource).toHaveBeenCalledTimes(1),
		);
		unmount();

		await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
		load.resolve(initialListFixture());
	});
});

function UseHomeContentHarness({
	getToken = async () => "session-token",
	isLoaded,
	isSignedIn,
}: {
	getToken?: () => Promise<string | null>;
	isLoaded: boolean;
	isSignedIn: boolean;
}) {
	const signingOutRef = useRef(false);
	const { content } = useHomeContent({
		getToken,
		isLoaded,
		isSignedIn,
		signingOutRef,
	});

	if (content.status === "ready") {
		return <Text>{content.initialList.items[0]?.name ?? "ready"}</Text>;
	}

	return <Text>{content.status}</Text>;
}

function householdSessionFixture(
	overrides: { householdId?: string; householdName?: string } = {},
): HouseholdSession {
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
			role: "owner",
			displayName: "Avery Chen",
		},
		activeList: { id: "lst_default_groceries", name: "Groceries" },
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
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
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

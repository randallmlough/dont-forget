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
	discardCachedHouseholdSessionIfUnauthorized,
	getHouseholdSession,
	type HouseholdSession,
	readCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";
import { createDefaultSyncCoordinator } from "@/lib/services/sync";
import { useHomeContent } from "@/screens/home/use-home-content";

import { createHouseholdActiveListDataSource } from "./active-list-data-source";
import { mockSyncCoordinatorFactory } from "./test-sync-coordinator";

jest.mock("./active-list-data-source", () => ({
	createHouseholdActiveListDataSource: jest.fn(),
}));

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
	discardCachedHouseholdSessionIfUnauthorized: jest.fn(),
	getHouseholdSession: jest.fn(),
	readCachedHouseholdSession: jest.fn(),
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
	jest.mocked(createHouseholdActiveListDataSource).mockReset();
	mockSyncCoordinatorFactory.created.length = 0;
	jest.mocked(useLogger).mockReturnValue(mockRootLogger);
	mockRootLogger.with.mockClear();
	mockRootLogger.with.mockImplementation(() => mockHouseholdLogger);
	jest
		.mocked(discardCachedHouseholdSessionIfUnauthorized)
		.mockResolvedValue(null);
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
			.mocked(createHouseholdActiveListDataSource)
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
			.mocked(createHouseholdActiveListDataSource)
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
			.mocked(createHouseholdActiveListDataSource)
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
			.mocked(createHouseholdActiveListDataSource)
			.mockReturnValue(
				noopDataSource(initialListFixture(), { syncAuthorized: false }),
			);

		render(<UseHomeContentHarness isLoaded={false} isSignedIn={false} />);

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
			.mocked(createHouseholdActiveListDataSource)
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
			.mocked(createHouseholdActiveListDataSource)
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
			.mocked(createHouseholdActiveListDataSource)
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
		});
		const freshDataSource = noopDataSource(freshList, {
			syncAuthorized: true,
			sync: freshSync,
		});
		jest.mocked(readCachedHouseholdSession).mockResolvedValue(cached);
		jest.mocked(getHouseholdSession).mockReturnValue(freshSession.promise);
		jest
			.mocked(discardCachedHouseholdSessionIfUnauthorized)
			.mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListDataSource)
			.mockImplementation((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			);

		render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
		freshSession.resolve(fresh);

		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
		expect(discardCachedHouseholdSessionIfUnauthorized).toHaveBeenCalledWith(
			fresh,
		);
		expect(cachedSync).not.toHaveBeenCalled();
		expect(mockSyncCoordinatorFactory.created[0]?.start).not.toHaveBeenCalled();
		expect(freshSync).not.toHaveBeenCalled();
		expect(mockSyncCoordinatorFactory.created[1]?.start).toHaveBeenCalledTimes(
			1,
		);
	});

	it("waits for a pending data source load to settle before closing after cancellation", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest
			.mocked(getHouseholdSession)
			.mockResolvedValue(householdSessionFixture());
		jest.mocked(createHouseholdActiveListDataSource).mockReturnValue({
			...noopDataSource(initialListFixture()),
			load: () => load.promise,
			close,
		});

		const { unmount } = render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() =>
			expect(createHouseholdActiveListDataSource).toHaveBeenCalledTimes(1),
		);
		const coordinator = mockSyncCoordinatorFactory.created[0];
		unmount();

		await settleMicrotasks();
		expect(coordinator?.stop).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		load.resolve(initialListFixture());
		await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
	});

	it("waits for a pending data source load to reject before closing after cancellation", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest
			.mocked(getHouseholdSession)
			.mockResolvedValue(householdSessionFixture());
		jest.mocked(createHouseholdActiveListDataSource).mockReturnValue({
			...noopDataSource(initialListFixture()),
			load: () => load.promise,
			close,
		});

		const { unmount } = render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() =>
			expect(createHouseholdActiveListDataSource).toHaveBeenCalledTimes(1),
		);
		const coordinator = mockSyncCoordinatorFactory.created[0];
		unmount();

		await settleMicrotasks();
		expect(coordinator?.stop).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		load.reject(new Error("offline"));
		await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
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
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
}

async function settleMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

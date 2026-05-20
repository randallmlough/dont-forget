import { render, screen, waitFor } from "@testing-library/react-native";
import { useRef } from "react";
import { Text } from "react-native";

import type {
	ActiveListDataSource,
	ActiveListInitialState,
} from "@/components/active-list";
import {
	type CachedHouseholdSession,
	discardCachedHouseholdSessionIfUnauthorized,
	getHouseholdSession,
	type HouseholdSession,
	readCachedHouseholdSession,
	saveCachedHouseholdSession,
} from "@/lib/services/household";
import { useHomeContent } from "@/screens/home/use-home-content";

import { createHouseholdActiveListDataSource } from "./active-list-data-source";

jest.mock("./active-list-data-source", () => ({
	createHouseholdActiveListDataSource: jest.fn(),
}));

jest.mock("@/lib/services/household", () => ({
	discardCachedHouseholdSessionIfUnauthorized: jest.fn(),
	getHouseholdSession: jest.fn(),
	readCachedHouseholdSession: jest.fn(),
	saveCachedHouseholdSession: jest.fn(),
}));

beforeEach(() => {
	jest.mocked(getHouseholdSession).mockReset();
	jest.mocked(createHouseholdActiveListDataSource).mockReset();
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

	it("closes a pending data source when the loading run is cancelled", async () => {
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
		unmount();

		expect(close).toHaveBeenCalledTimes(1);
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

function initialListFixture(): ActiveListInitialState {
	return {
		householdName: "Avery",
		listName: "Groceries",
		items: [
			{
				id: "itm_milk",
				name: "Milk",
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

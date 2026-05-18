import { render, screen, waitFor } from "@testing-library/react-native";
import { useRef } from "react";
import { Text } from "react-native";

import type {
	ActiveListDataAdapter,
	ActiveListInitialState,
} from "@/components/active-list";
import { createHouseholdActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import {
	type CachedBootstrapMetadata,
	discardCachedBootstrapMetadataIfUnauthorized,
	readCachedBootstrapMetadata,
	saveCachedBootstrapMetadata,
} from "@/lib/app/offline-bootstrap-cache";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { useHomeContent } from "@/screens/home/use-home-content";

jest.mock("@/lib/app/bootstrap-client", () => ({
	bootstrapWithClerk: jest.fn(),
}));

jest.mock("@/lib/app/active-list-adapter", () => ({
	createHouseholdActiveListAdapter: jest.fn(),
}));

jest.mock("@/lib/app/offline-bootstrap-cache", () => ({
	discardCachedBootstrapMetadataIfUnauthorized: jest.fn(),
	readCachedBootstrapMetadata: jest.fn(),
	saveCachedBootstrapMetadata: jest.fn(),
}));

beforeEach(() => {
	jest.mocked(bootstrapWithClerk).mockReset();
	jest.mocked(createHouseholdActiveListAdapter).mockReset();
	jest
		.mocked(discardCachedBootstrapMetadataIfUnauthorized)
		.mockResolvedValue(null);
	jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(null);
	jest
		.mocked(saveCachedBootstrapMetadata)
		.mockResolvedValue(cachedBootstrapFixture());
});

describe("useHomeContent", () => {
	it("does not restart bootstrap when the getToken callback changes", async () => {
		const bootstrap = bootstrapFixture();
		const getToken = jest.fn(async () => "session-token");
		const nextGetToken = jest.fn(async () => "next-session-token");
		jest.mocked(bootstrapWithClerk).mockImplementation(async (loadToken) => {
			await loadToken();
			return bootstrap;
		});
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockReturnValue(noopAdapter(initialListFixture()));

		const { rerender } = render(
			<UseHomeContentHarness getToken={getToken} isLoaded isSignedIn />,
		);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		rerender(
			<UseHomeContentHarness getToken={nextGetToken} isLoaded isSignedIn />,
		);

		expect(bootstrapWithClerk).toHaveBeenCalledTimes(1);
		expect(getToken).toHaveBeenCalledTimes(1);
		expect(nextGetToken).not.toHaveBeenCalled();
	});

	it("opens cached local List data before Clerk finishes loading", async () => {
		const cached = cachedBootstrapFixture();
		jest.mocked(readCachedBootstrapMetadata).mockResolvedValue(cached);
		jest
			.mocked(createHouseholdActiveListAdapter)
			.mockReturnValue(
				noopAdapter(initialListFixture(), { syncAuthorized: false }),
			);

		render(<UseHomeContentHarness isLoaded={false} isSignedIn={false} />);

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
	});

	it("closes a pending adapter when the loading run is cancelled", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrapFixture());
		jest.mocked(createHouseholdActiveListAdapter).mockReturnValue({
			...noopAdapter(initialListFixture()),
			load: () => load.promise,
			close,
		});

		const { unmount } = render(<UseHomeContentHarness isLoaded isSignedIn />);

		await waitFor(() =>
			expect(createHouseholdActiveListAdapter).toHaveBeenCalledTimes(1),
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

function bootstrapFixture(
	overrides: { householdId?: string; householdName?: string } = {},
): BootstrapResponse {
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
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

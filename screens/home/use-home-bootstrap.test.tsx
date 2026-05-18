import { act, renderHook, waitFor } from "@testing-library/react-native";

import type { ActiveListInitialState } from "@/components/active-list";
import { createRemoteActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import { useHomeBootstrap } from "@/screens/home/use-home-bootstrap";

const mockLoggerError = jest.fn();
const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: mockLoggerError,
	with: jest.fn(),
};

jest.mock("@/lib/app/bootstrap-client", () => ({
	bootstrapWithClerk: jest.fn(),
}));

jest.mock("@/lib/app/active-list-adapter", () => ({
	createRemoteActiveListAdapter: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
	useLogger: () => mockLogger,
}));

beforeEach(() => {
	jest.mocked(bootstrapWithClerk).mockReset();
	jest.mocked(createRemoteActiveListAdapter).mockReset();
	mockLoggerError.mockReset();
});

describe("useHomeBootstrap", () => {
	it("loads Home bootstrap state and retries after a load failure", async () => {
		const initialList = initialListFixture();
		jest
			.mocked(bootstrapWithClerk)
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(bootstrapFixture());
		jest.mocked(createRemoteActiveListAdapter).mockReturnValue({
			async load() {
				return initialList;
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
			async close() {},
		});

		const { result } = renderHook(() =>
			useHomeBootstrap({
				isAuthLoaded: true,
				isSignedIn: true,
				getToken: async () => "session-token",
			}),
		);

		await waitFor(() => expect(result.current.state.status).toBe("error"));
		expect(mockLoggerError).toHaveBeenCalledWith("home bootstrap failed", {
			error: expect.any(Error),
		});

		act(() => {
			result.current.actions.retry();
		});

		await waitFor(() => expect(result.current.state.status).toBe("ready"));
		expect(result.current.state).toMatchObject({
			status: "ready",
			activeMemberName: "Avery Chen",
			initialList,
		});
		expect(bootstrapWithClerk).toHaveBeenCalledTimes(2);
	});

	it("closes an adapter that is still loading when unmounted", async () => {
		const load = deferred<ActiveListInitialState>();
		const close = jest.fn().mockResolvedValue(undefined);
		jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrapFixture());
		jest.mocked(createRemoteActiveListAdapter).mockReturnValue({
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
			close,
		});

		const { unmount } = renderHook(() =>
			useHomeBootstrap({
				isAuthLoaded: true,
				isSignedIn: true,
				getToken: async () => "session-token",
			}),
		);

		await waitFor(() =>
			expect(createRemoteActiveListAdapter).toHaveBeenCalledTimes(1),
		);
		unmount();

		expect(close).toHaveBeenCalledTimes(1);
		load.resolve(initialListFixture());
	});
});

function bootstrapFixture() {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
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

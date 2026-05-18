import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";

import type {
	ActiveListDataAdapter,
	ActiveListInitialState,
} from "@/components/active-list";
import { createRemoteActiveListAdapter } from "@/lib/app/active-list-adapter";
import { bootstrapWithClerk } from "@/lib/app/bootstrap-client";
import {
	clerkMocks,
	setMockAuthCallbacksUnstable,
	setMockAuthState,
	setMockUserState,
} from "@/lib/test/mocks/clerk";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

jest.mock("@/lib/app/bootstrap-client", () => ({
	bootstrapWithClerk: jest.fn(),
}));

jest.mock("@/lib/app/active-list-adapter", () => ({
	createRemoteActiveListAdapter: jest.fn(),
}));

beforeEach(() => {
	jest.mocked(bootstrapWithClerk).mockReset();
	jest.mocked(createRemoteActiveListAdapter).mockReset();
});

describe("HomeScreen", () => {
	it("does not restart bootstrap when auth callbacks are not referentially stable", async () => {
		const initialList = initialListFixture();
		jest.mocked(bootstrapWithClerk).mockResolvedValue(bootstrapFixture());
		jest
			.mocked(createRemoteActiveListAdapter)
			.mockReturnValue(noopAdapter(initialList));
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });
		setMockAuthCallbacksUnstable(true);
		setMockUserState({
			user: {
				fullName: "Avery Chen",
				firstName: "Avery",
				primaryEmailAddress: { emailAddress: "avery@example.com" },
			},
		});

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(bootstrapWithClerk).toHaveBeenCalledTimes(1);
		expect(createRemoteActiveListAdapter).toHaveBeenCalledTimes(1);
	});

	it("closes an adapter that is still loading when Home unmounts", async () => {
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
		clerkMocks.getToken.mockResolvedValue("session-token");
		setMockAuthState({ isSignedIn: true });

		const { unmount } = render(<HomeScreen />);

		await waitFor(() =>
			expect(createRemoteActiveListAdapter).toHaveBeenCalledTimes(1),
		);
		unmount();

		expect(close).toHaveBeenCalledTimes(1);
		load.resolve(initialListFixture());
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

function noopAdapter(
	initialList: ActiveListInitialState,
): ActiveListDataAdapter {
	return {
		async load() {
			return initialList;
		},
		async addItem(name) {
			return { id: "itm_new", name, checked: false, checkedByMemberName: null };
		},
		async setItemChecked() {},
		async close() {},
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

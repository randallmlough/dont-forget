import { fireEvent, render, screen } from "@testing-library/react-native";
import { useActiveHousehold } from "@/components/active-household";
import type {
	ActiveListDataSource,
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

jest.mock("@/components/active-household", () => ({
	useActiveHousehold: jest.fn(),
}));

describe("HomeScreen", () => {
	it("renders provider-derived loading state", () => {
		jest.mocked(useActiveHousehold).mockReturnValue({
			content: { status: "loading" },
			currentMemberName: "Avery Chen",
			retry: jest.fn(),
			signOut: jest.fn(),
		});

		render(<HomeScreen />);

		expect(screen.getByText("Preparing your Household")).toBeTruthy();
	});

	it("renders provider-derived ready state", () => {
		jest.mocked(useActiveHousehold).mockReturnValue({
			content: {
				status: "ready",
				activeMemberName: "Avery Chen",
				resourceKey: "current-list:1",
				initialList: initialListFixture(),
				dataSource: noopDataSource(initialListFixture()),
				syncCoordinator: syncCoordinatorFixture(),
			},
			currentMemberName: "Avery Chen",
			retry: jest.fn(),
			signOut: jest.fn(),
		});

		render(<HomeScreen />);

		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Milk")).toBeTruthy();
	});

	it("wires retry and sign out actions from the provider", () => {
		const retry = jest.fn();
		const signOut = jest.fn();
		jest.mocked(useActiveHousehold).mockReturnValue({
			content: {
				status: "error",
				message: "Unable to prepare your Household. Please try again.",
			},
			currentMemberName: "Avery Chen",
			retry,
			signOut,
		});

		render(<HomeScreen />);

		fireEvent.press(screen.getByText("Try again"));
		fireEvent.press(screen.getByText("Sign out"));
		expect(retry).toHaveBeenCalledTimes(1);
		expect(signOut).toHaveBeenCalledTimes(1);
	});
});

it("remounts Active List when the Current List resource changes", () => {
	const cachedList = initialListFixture({ itemName: "Cached Milk" });
	const freshList = initialListFixture({ itemName: "Fresh Eggs" });
	const { rerender } = render(
		<HomeScreenView
			currentMemberName="Avery Chen"
			content={{
				status: "ready",
				activeMemberName: "Avery Chen",
				resourceKey: "current-list:1",
				initialList: cachedList,
				dataSource: noopDataSource(cachedList),
				syncCoordinator: syncCoordinatorFixture(),
			}}
		/>,
	);

	expect(screen.getByText("Cached Milk")).toBeTruthy();
	rerender(
		<HomeScreenView
			currentMemberName="Avery Chen"
			content={{
				status: "ready",
				activeMemberName: "Avery Chen",
				resourceKey: "current-list:2",
				initialList: freshList,
				dataSource: noopDataSource(freshList),
				syncCoordinator: syncCoordinatorFixture(),
			}}
		/>,
	);

	expect(screen.getByText("Fresh Eggs")).toBeTruthy();
	expect(screen.queryByText("Cached Milk")).toBeNull();
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

	it("renders Active List data after active Household loading succeeds", () => {
		const initialList = initialListFixture();

		render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					resourceKey: "current-list:1",
					initialList,
					dataSource: noopDataSource(initialList),
					syncCoordinator: syncCoordinatorFixture(),
				}}
			/>,
		);

		expect(screen.getByText("Avery")).toBeTruthy();
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
	});
});

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
		load: jest.fn().mockResolvedValue(initialList),
		addItem: jest.fn(),
		setItemChecked: jest.fn(),
		pull: jest.fn().mockResolvedValue({ changed: false }),
		sync: jest.fn().mockResolvedValue({ changed: false }),
		close: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

function syncCoordinatorFixture(): ActiveListSyncCoordinator {
	return {
		getStatus: jest.fn(() => "synced"),
		subscribe: jest.fn(() => ({ remove() {} })),
		start: jest.fn(),
		stop: jest.fn().mockResolvedValue(undefined),
		requestSync: jest.fn().mockResolvedValue(null),
	};
}

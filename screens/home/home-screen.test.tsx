import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { useActiveHousehold } from "@/components/active-household";
import {
	activeListDataSourceFixture,
	initialListFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";
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

	it("renders provider-derived ready state", async () => {
		jest.mocked(useActiveHousehold).mockReturnValue({
			content: {
				status: "ready",
				activeMemberName: "Avery Chen",
				resourceKey: "current-list:1",
				dataSource: activeListDataSourceFixture(),
				syncCoordinator: syncCoordinatorFixture(),
			},
			currentMemberName: "Avery Chen",
			retry: jest.fn(),
			signOut: jest.fn(),
		});

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
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

it("remounts Active List when the Current List resource changes", async () => {
	const cachedList = initialListFixture({ itemName: "Cached Milk" });
	const freshList = initialListFixture({ itemName: "Fresh Eggs" });
	const { rerender } = render(
		<HomeScreenView
			currentMemberName="Avery Chen"
			content={{
				status: "ready",
				activeMemberName: "Avery Chen",
				resourceKey: "current-list:1",
				dataSource: activeListDataSourceFixture({
					load: jest.fn().mockResolvedValue(cachedList),
				}),
				syncCoordinator: syncCoordinatorFixture(),
			}}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
	rerender(
		<HomeScreenView
			currentMemberName="Avery Chen"
			content={{
				status: "ready",
				activeMemberName: "Avery Chen",
				resourceKey: "current-list:2",
				dataSource: activeListDataSourceFixture({
					load: jest.fn().mockResolvedValue(freshList),
				}),
				syncCoordinator: syncCoordinatorFixture(),
			}}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
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

	it("renders Active List data after active Household loading succeeds", async () => {
		const initialList = initialListFixture({
			checked: true,
			checkedByMemberName: "Avery Chen",
		});

		render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					resourceKey: "current-list:1",
					dataSource: activeListDataSourceFixture({
						load: jest.fn().mockResolvedValue(initialList),
					}),
					syncCoordinator: syncCoordinatorFixture(),
				}}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Avery")).toBeTruthy());
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
	});

	it("shows a retryable Current List error when list loading fails", async () => {
		const initialList = initialListFixture({ itemName: "Retry Milk" });
		const load = jest
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(initialList);

		render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					resourceKey: "current-list:1",
					dataSource: activeListDataSourceFixture({ load }),
					syncCoordinator: syncCoordinatorFixture(),
				}}
			/>,
		);

		await waitFor(() =>
			expect(screen.getByText("Current List unavailable")).toBeTruthy(),
		);
		fireEvent.press(screen.getByText("Try again"));

		await waitFor(() => expect(screen.getByText("Retry Milk")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("ignores stale Current List loads after the resource changes", async () => {
		const staleLoad = deferred<ReturnType<typeof initialListFixture>>();
		const freshLoad = deferred<ReturnType<typeof initialListFixture>>();
		const { rerender } = render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					resourceKey: "current-list:1",
					dataSource: activeListDataSourceFixture({
						load: jest.fn(() => staleLoad.promise),
					}),
					syncCoordinator: syncCoordinatorFixture(),
				}}
			/>,
		);

		rerender(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={{
					status: "ready",
					activeMemberName: "Avery Chen",
					resourceKey: "current-list:2",
					dataSource: activeListDataSourceFixture({
						load: jest.fn(() => freshLoad.promise),
					}),
					syncCoordinator: syncCoordinatorFixture(),
				}}
			/>,
		);

		await act(async () => {
			freshLoad.resolve(initialListFixture({ itemName: "Fresh Eggs" }));
			await freshLoad.promise;
		});
		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());

		await act(async () => {
			staleLoad.resolve(initialListFixture({ itemName: "Stale Milk" }));
			await staleLoad.promise;
		});
		expect(screen.queryByText("Stale Milk")).toBeNull();
		expect(screen.getByText("Fresh Eggs")).toBeTruthy();
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

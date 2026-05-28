import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import {
	type ActiveHouseholdContentState,
	useActiveHousehold,
} from "@/components/active-household";
import {
	initialListFixture,
	itemFixture,
	itemServiceFixture,
	listFixture,
	listServiceFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
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
			content: readyContent(),
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

it("remounts Active List when the Household resource changes", async () => {
	const { rerender } = render(
		<HomeScreenView
			currentMemberName="Avery Chen"
			content={readyContent({
				resourceKey: "active-household:1",
				initialList: initialListFixture({ itemName: "Cached Milk" }),
			})}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
	rerender(
		<HomeScreenView
			currentMemberName="Avery Chen"
			content={readyContent({
				resourceKey: "active-household:2",
				initialList: initialListFixture({ itemName: "Fresh Eggs" }),
			})}
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
		render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={readyContent({
					initialList: initialListFixture({
						checked: true,
						checkedByMemberName: "Avery Chen",
					}),
				})}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Avery")).toBeTruthy());
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
	});

	it("uses active Member fallback name for checked Item display", async () => {
		const content = readyContent({
			initialList: initialListFixture({ checked: true }),
		});
		content.activeMember.displayName = null;
		content.members = content.members.map((member) =>
			member.userId === content.activeMember.userId
				? { ...member, displayName: null }
				: member,
		);

		render(<HomeScreenView currentMemberName="Avery Chen" content={content} />);

		await waitFor(() =>
			expect(screen.getByText("Checked by Avery Chen")).toBeTruthy(),
		);
	});

	it("shows a retryable List error when list loading fails", async () => {
		const content = readyContent();
		jest
			.mocked(content.listService.getList)
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(listFixture());

		render(<HomeScreenView currentMemberName="Avery Chen" content={content} />);

		await waitFor(() =>
			expect(screen.getByText("List unavailable")).toBeTruthy(),
		);
		fireEvent.press(screen.getByText("Try again"));

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(content.listService.getList).toHaveBeenCalledTimes(2);
	});

	it("loads the default List by explicit listId after active Household context exists", async () => {
		const content = readyContent();

		render(<HomeScreenView currentMemberName="Avery Chen" content={content} />);

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
		expect(content.listService.getList).toHaveBeenCalledWith({
			listId: DEFAULT_LIST_ID,
		});
		expect(content.itemService.listItems).toHaveBeenCalledWith({
			listId: DEFAULT_LIST_ID,
		});
	});

	it("uses explicit listId for List operations", async () => {
		const addItem = jest
			.fn()
			.mockResolvedValue(itemFixture({ id: "itm_eggs", name: "Eggs" }));
		const setItemChecked = jest.fn().mockResolvedValue(undefined);
		const content = readyContent({
			itemService: itemServiceFixture({ addItem, setItemChecked }),
		});

		render(<HomeScreenView currentMemberName="Avery Chen" content={content} />);
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		fireEvent.changeText(screen.getByPlaceholderText("Add an Item"), "Eggs");
		await act(async () => {
			fireEvent.press(screen.getByText("Add"));
		});
		await act(async () => {
			fireEvent.press(screen.getByRole("checkbox", { name: "Eggs" }));
		});

		expect(addItem).toHaveBeenCalledWith({
			listId: DEFAULT_LIST_ID,
			userId: "usr_avery",
			name: "Eggs",
		});
		expect(setItemChecked).toHaveBeenCalledWith({
			listId: DEFAULT_LIST_ID,
			itemId: "itm_eggs",
			userId: "usr_avery",
			checked: true,
		});
	});

	it("ignores stale List loads after the Household resource changes", async () => {
		const staleLoad = deferred<ReturnType<typeof listFixture>>();
		const freshLoad = deferred<ReturnType<typeof listFixture>>();
		const { rerender } = render(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={readyContent({
					resourceKey: "active-household:1",
					listService: listServiceFixture({
						getList: jest.fn(() => staleLoad.promise),
					}),
				})}
			/>,
		);

		rerender(
			<HomeScreenView
				currentMemberName="Avery Chen"
				content={readyContent({
					resourceKey: "active-household:2",
					initialList: initialListFixture({ itemName: "Fresh Eggs" }),
					listService: listServiceFixture({
						getList: jest.fn(() => freshLoad.promise),
					}),
				})}
			/>,
		);

		await act(async () => {
			freshLoad.resolve(listFixture());
			await freshLoad.promise;
		});
		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());

		await act(async () => {
			staleLoad.resolve(listFixture({ name: "Stale" }));
			await staleLoad.promise;
		});
		expect(screen.queryByText("Stale")).toBeNull();
		expect(screen.getByText("Fresh Eggs")).toBeTruthy();
	});
});

type ReadyContentOverrides = {
	resourceKey?: string;
	initialList?: ReturnType<typeof initialListFixture>;
	listService?: ReturnType<typeof listServiceFixture>;
	itemService?: ReturnType<typeof itemServiceFixture>;
};

function readyContent(
	overrides: ReadyContentOverrides = {},
): Extract<ActiveHouseholdContentState, { status: "ready" }> {
	const initialList = overrides.initialList ?? initialListFixture();
	return {
		status: "ready",
		activeMemberName: "Avery Chen",
		household: { id: "hh_avery", name: initialList.householdName },
		activeMember: { userId: "usr_avery", displayName: "Avery Chen" },
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		resourceKey: overrides.resourceKey ?? "active-household:1",
		listService:
			overrides.listService ??
			listServiceFixture({
				getList: jest
					.fn()
					.mockResolvedValue(listFixture({ name: initialList.listName })),
			}),
		itemService:
			overrides.itemService ??
			itemServiceFixture({
				listItems: jest.fn().mockResolvedValue(
					initialList.items.map((item, index) =>
						itemFixture({
							id: item.id,
							name: item.name,
							checked: item.checked,
							checkedByUserId: item.checked ? "usr_avery" : null,
							position: index,
						}),
					),
				),
			}),
		syncCoordinator: syncCoordinatorFixture(),
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

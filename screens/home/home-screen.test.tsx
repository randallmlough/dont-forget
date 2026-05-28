import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { ActiveListInitialState } from "@/components/active-list";
import { useAuthenticatedAppSession } from "@/components/session";
import { itemFixture, listFixture } from "@/db/fixtures/session";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import {
	authenticatedAppSessionFixture,
	itemServiceFixture,
	listServiceFixture,
	syncCoordinatorFixture,
} from "@/lib/services/session/test-fixtures";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

describe("HomeScreen", () => {
	it("renders provider-derived loading state", () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			retry: jest.fn(),
			signOut: jest.fn(async () => undefined),
		});

		render(<HomeScreen />);

		expect(screen.getByText("Preparing your Household")).toBeTruthy();
	});

	it("renders provider-derived ready state", async () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "ready", refreshing: false },
			session: readySession(),
			retry: jest.fn(),
			signOut: jest.fn(async () => undefined),
		});

		render(<HomeScreen />);

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
		expect(screen.getByText("Milk")).toBeTruthy();
	});

	it("wires retry and sign out actions from the provider", () => {
		const retry = jest.fn();
		const signOut = jest.fn(async () => undefined);
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: {
				status: "error",
				message: "Unable to prepare your Household. Please try again.",
			},
			session: null,
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

it("remounts Active List when the session resource changes", async () => {
	const { rerender } = render(
		<HomeScreenView
			state={{ status: "ready", refreshing: false }}
			session={readySession({
				resourceKey: "authenticated-app-session:1",
				initialList: initialListFixture({ itemName: "Cached Milk" }),
			})}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
	rerender(
		<HomeScreenView
			state={{ status: "ready", refreshing: false }}
			session={readySession({
				resourceKey: "authenticated-app-session:2",
				initialList: initialListFixture({ itemName: "Fresh Eggs" }),
			})}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
	expect(screen.queryByText("Cached Milk")).toBeNull();
});

describe("HomeScreenView", () => {
	it("shows Authenticated App Session loading and retryable error states", () => {
		const retry = jest.fn();

		const { rerender } = render(
			<HomeScreenView state={{ status: "loading" }} session={null} />,
		);
		expect(screen.getByText("Preparing your Household")).toBeTruthy();

		rerender(
			<HomeScreenView
				state={{
					status: "error",
					message: "Unable to prepare your Household. Please try again.",
				}}
				session={null}
				onRetry={retry}
			/>,
		);

		fireEvent.press(screen.getByText("Try again"));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("renders Active List data after authenticated app session loading succeeds", async () => {
		render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={readySession({
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
		const session = readySession({
			initialList: initialListFixture({ checked: true }),
		});
		session.activeMember.displayName = null;
		session.members = session.members.map((member) =>
			member.userId === session.activeMember.userId
				? { ...member, displayName: null }
				: member,
		);

		render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={session}
			/>,
		);

		await waitFor(() =>
			expect(screen.getByText("Checked by Avery Chen")).toBeTruthy(),
		);
	});

	it("shows a retryable List error when list loading fails", async () => {
		const session = readySession();
		jest
			.mocked(session.services.lists.getList)
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(listFixture());

		render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={session}
			/>,
		);

		await waitFor(() =>
			expect(screen.getByText("List unavailable")).toBeTruthy(),
		);
		fireEvent.press(screen.getByText("Try again"));

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(session.services.lists.getList).toHaveBeenCalledTimes(2);
	});

	it("loads the default List by explicit listId after authenticated app session context exists", async () => {
		const session = readySession();

		render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={session}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
		expect(session.services.lists.getList).toHaveBeenCalledWith({
			listId: DEFAULT_LIST_ID,
		});
		expect(session.services.items.listItems).toHaveBeenCalledWith({
			listId: DEFAULT_LIST_ID,
		});
	});

	it("uses explicit listId for List operations", async () => {
		const addItem = jest
			.fn()
			.mockResolvedValue(itemFixture({ id: "itm_eggs", name: "Eggs" }));
		const setItemChecked = jest.fn().mockResolvedValue(undefined);
		const session = readySession({
			items: itemServiceFixture({ addItem, setItemChecked }),
		});

		render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={session}
			/>,
		);
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

	it("ignores stale List loads after the session resource changes", async () => {
		const staleLoad = deferred<ReturnType<typeof listFixture>>();
		const freshLoad = deferred<ReturnType<typeof listFixture>>();
		const { rerender } = render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={readySession({
					resourceKey: "authenticated-app-session:1",
					lists: listServiceFixture({
						getList: jest.fn(() => staleLoad.promise),
					}),
				})}
			/>,
		);

		rerender(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={readySession({
					resourceKey: "authenticated-app-session:2",
					initialList: initialListFixture({ itemName: "Fresh Eggs" }),
					lists: listServiceFixture({
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

type ReadySessionOverrides = {
	resourceKey?: string;
	initialList?: ActiveListInitialState;
	lists?: ReturnType<typeof listServiceFixture>;
	items?: ReturnType<typeof itemServiceFixture>;
	sync?: ReturnType<typeof syncCoordinatorFixture>;
};

function readySession(
	overrides: ReadySessionOverrides = {},
): AuthenticatedAppSession {
	const initialList = overrides.initialList ?? initialListFixture();
	return authenticatedAppSessionFixture({
		activeHousehold: { id: "hh_avery", name: initialList.householdName },
		resourceKey: overrides.resourceKey,
		services: {
			lists:
				overrides.lists ??
				listServiceFixture({
					getList: jest
						.fn()
						.mockResolvedValue(listFixture({ name: initialList.listName })),
				}),
			items:
				overrides.items ??
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
			sync: overrides.sync ?? syncCoordinatorFixture(),
		},
	});
}

function initialListFixture(
	overrides: {
		checked?: boolean;
		checkedByMemberName?: string | null;
		householdName?: string;
		itemName?: string;
		items?: ActiveListInitialState["items"];
		listName?: string;
	} = {},
): ActiveListInitialState {
	return {
		householdName: overrides.householdName ?? "Avery",
		listName: overrides.listName ?? "Groceries",
		items: overrides.items ?? [
			{
				id: "itm_milk",
				name: overrides.itemName ?? "Milk",
				checked: overrides.checked ?? false,
				checkedByMemberName: overrides.checkedByMemberName ?? null,
			},
		],
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

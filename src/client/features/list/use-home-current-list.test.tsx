import { useQuery } from "@powersync/react";
import {
	act,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Text } from "react-native";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { Item, ListItemsInput } from "@/client/features/list/item-service";
import type { ListSummary } from "@/client/features/list/list-service";
import { logger } from "@/client/lib/logger";
import type { ProductQuery } from "@/client/lib/product-database";
import type { AuthenticatedAppSession } from "@/client/session";
import { useHomeCurrentList } from "./use-home-current-list";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

jest.mock("@powersync/react", () => ({ useQuery: jest.fn() }));

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

jest.mock("@/client/features/list/current-selection", () => ({
	getCurrentListSelection: jest.fn(),
	clearCurrentListSelectionIfMatches: jest.fn(async () => false),
}));

jest.mock("./use-product-services", () => ({
	useProductServices: jest.fn(),
}));

type WatchedQueryResult<T> = {
	data: T[];
	isLoading: boolean;
	isFetching: boolean;
	error: Error | undefined;
};

type ItemQuery = ProductQuery<Item> & { readonly listId: string };

const mockUseQuery = jest.mocked(useQuery);
const mockGetSelection = jest.mocked(getCurrentListSelection);
const mockClearSelection = jest.mocked(clearCurrentListSelectionIfMatches);
const mockUseProductServices = jest.mocked(useProductServices);
const mockLogger = jest.mocked(logger);

const listSummariesQuery: ProductQuery<ListSummary> = {
	compile: () => ({ sql: "SELECT lists", parameters: [] }),
	execute: async () => [],
};

let summariesResult: WatchedQueryResult<ListSummary>;
let itemResults: Map<string, WatchedQueryResult<Item>>;
let itemQueryListIds: Map<object, string>;

beforeEach(() => {
	summariesResult = watchedQuery({ data: [] });
	itemResults = new Map();
	itemQueryListIds = new Map();
	mockGetSelection.mockResolvedValue(null);
	mockClearSelection.mockResolvedValue(false);
	mockUseProductServices.mockReturnValue(productServices());
	mockUseQuery.mockImplementation((query) => {
		if (query === listSummariesQuery) {
			return summariesResult;
		}
		const key = queryObject(query);
		const listId = key ? itemQueryListIds.get(key) : undefined;
		if (listId !== undefined) {
			return itemResults.get(listId) ?? watchedQuery({ data: [] });
		}
		throw new Error("unexpected watched query");
	});
});

afterEach(() => {
	jest.clearAllMocks();
});

describe("useHomeCurrentList", () => {
	it("creates product services for the active Household and User", async () => {
		await renderHomeCurrentList({
			summaries: [summary("lst_recent")],
			itemsByListId: { lst_recent: [] },
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		expect(mockUseProductServices).toHaveBeenCalledWith({
			householdId: "hh_1",
			userId: "usr_avery",
		});
	});

	it("renders loading while the stored Current List selection is pending", async () => {
		let resolveSelection: (value: string | null) => void = () => {};
		const pendingSelection = new Promise<string | null>((resolve) => {
			resolveSelection = resolve;
		});
		mockGetSelection.mockReturnValue(pendingSelection);
		const view = await renderHomeCurrentList({
			summaries: [summary("lst_recent")],
			itemsByListId: { lst_recent: [] },
		});

		expect(screen.getByText("loading")).toBeTruthy();

		await act(async () => {
			resolveSelection(null);
		});
		view.unmount();
	});

	it("renders loading while active List summaries are loading", async () => {
		await renderHomeCurrentList({
			summaries: [],
			summariesIsLoading: true,
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));
		expect(screen.getByText("loading")).toBeTruthy();
	});

	it("resolves the stored selection when it is an active List", async () => {
		mockGetSelection.mockResolvedValue("lst_pantry");
		await renderHomeCurrentList({
			summaries: [
				summary("lst_groceries", "Groceries"),
				summary("lst_pantry", "Pantry"),
			],
			itemsByListId: { lst_pantry: [item("itm_flour", "lst_pantry")] },
		});

		expect(await screen.findByText("active:lst_pantry")).toBeTruthy();
		expect(screen.getByText("listName:Pantry")).toBeTruthy();
		expect(screen.getByText("item:itm_flour")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("falls back in memory to the most recently active List when nothing is stored", async () => {
		mockGetSelection.mockResolvedValue(null);
		await renderHomeCurrentList({
			// Summaries are queried sort: recentActivity, so index 0 is most recent.
			summaries: [
				summary("lst_recent", "Recent"),
				summary("lst_older", "Older"),
			],
			itemsByListId: { lst_recent: [] },
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		expect(screen.getByText("listName:Recent")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection after fresh List summaries emit and falls back without persisting the fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		const view = await renderHomeCurrentList({
			summaries: [],
			summariesIsLoading: true,
			itemsByListId: { lst_recent: [] },
		});

		expect(await screen.findByText("loading")).toBeTruthy();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		summariesResult = watchedQuery({
			data: [summary("lst_recent", "Recent")],
		});
		view.rerender(<HomeCurrentListHarness session={sessionFixture()} />);

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_gone",
			),
		);
	});

	it("renders zero-active when there are no active Lists", async () => {
		await renderHomeCurrentList({ summaries: [] });

		expect(await screen.findByText("zeroActive")).toBeTruthy();
	});

	it("maps a summaries query error to the List error state", async () => {
		await renderHomeCurrentList({
			summaries: [],
			summariesError: new Error("lists failed"),
		});

		expect(
			await screen.findByText(
				"error:Unable to load this List. Please try again.",
			),
		).toBeTruthy();
	});

	it("maps an Items query error to the List error state", async () => {
		await renderHomeCurrentList({
			summaries: [summary("lst_recent")],
			itemErrorsByListId: {
				lst_recent: new Error("items failed"),
			},
		});

		expect(
			await screen.findByText(
				"error:Unable to load this List. Please try again.",
			),
		).toBeTruthy();
	});

	it("logs a clear failure and keeps rendering the active fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		mockClearSelection.mockRejectedValue(new Error("storage offline"));
		const view = await renderHomeCurrentList({
			summaries: [],
			summariesIsLoading: true,
			itemsByListId: { lst_recent: [] },
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		summariesResult = watchedQuery({
			data: [summary("lst_recent")],
		});
		view.rerender(<HomeCurrentListHarness session={sessionFixture()} />);

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"current List selection clear failed",
				{ error: expect.any(Error) },
			),
		);
	});

	it("logs a selection read failure and renders the most recently active List", async () => {
		mockGetSelection.mockRejectedValue(new Error("storage offline"));
		await renderHomeCurrentList({
			summaries: [summary("lst_recent")],
			itemsByListId: { lst_recent: [] },
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"current List selection read failed",
				{ error: expect.any(Error) },
			),
		);
	});

	it("reload re-reads the stored selection and renders the newly selected List", async () => {
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		const { result } = await renderUseHomeCurrentList({
			summaries: [
				summary("lst_recent", "Recent"),
				summary("lst_pantry", "Pantry"),
			],
			itemsByListId: {
				lst_recent: [],
				lst_pantry: [],
			},
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);

		await act(async () => {
			result.current.reload();
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_pantry",
			}),
		);
		expect(mockGetSelection).toHaveBeenCalledTimes(2);
	});

	it("does not clear a refreshed stored selection before List summaries emit after the refresh", async () => {
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		const { result } = await renderUseHomeCurrentList({
			summaries: [summary("lst_recent", "Recent")],
			itemsByListId: {
				lst_recent: [],
				lst_pantry: [],
			},
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);
		mockClearSelection.mockClear();

		await act(async () => {
			result.current.reload();
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("does not clear an absent stored selection while summaries are fetching", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		const { rerender } = await renderUseHomeCurrentList({
			summaries: [],
			summariesIsLoading: true,
			itemsByListId: { lst_recent: [] },
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			summariesResult = watchedQuery({
				data: [summary("lst_recent", "Recent")],
				isFetching: true,
			});
			rerender(undefined);
		});

		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("filters Item rows that belong to a different List id", async () => {
		await renderHomeCurrentList({
			summaries: [summary("lst_current")],
			itemsByListId: {
				lst_current: [
					item("itm_current", "lst_current"),
					item("itm_previous", "lst_previous"),
				],
			},
		});

		expect(await screen.findByText("active:lst_current")).toBeTruthy();
		expect(screen.getByText("item:itm_current")).toBeTruthy();
		expect(screen.queryByText("item:itm_previous")).toBeNull();
	});
});

function HomeCurrentListHarness({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const { state } = useHomeCurrentList(session);
	if (state.status === "active") {
		return (
			<>
				<Text>{`active:${state.listId}`}</Text>
				<Text>{`listName:${state.list.listName}`}</Text>
				{state.list.items.map((row) => (
					<Text key={row.id}>{`item:${row.id}`}</Text>
				))}
			</>
		);
	}
	if (state.status === "error") {
		return <Text>{`error:${state.message}`}</Text>;
	}
	return <Text>{state.status}</Text>;
}

async function renderHomeCurrentList(input: WatchedQueryFixture) {
	arrangeWatchedQueries(input);
	return render(<HomeCurrentListHarness session={sessionFixture()} />);
}

async function renderUseHomeCurrentList(input: WatchedQueryFixture) {
	arrangeWatchedQueries(input);
	return renderHook(() => useHomeCurrentList(sessionFixture()));
}

type WatchedQueryFixture = {
	summaries: ListSummary[];
	summariesIsLoading?: boolean;
	summariesIsFetching?: boolean;
	summariesError?: Error;
	itemsByListId?: Record<string, Item[]>;
	itemErrorsByListId?: Record<string, Error>;
};

function arrangeWatchedQueries(input: WatchedQueryFixture) {
	summariesResult = watchedQuery({
		data: input.summaries,
		isLoading: input.summariesIsLoading,
		isFetching: input.summariesIsFetching,
		error: input.summariesError,
	});
	itemResults = new Map();
	for (const [listId, items] of Object.entries(input.itemsByListId ?? {})) {
		itemResults.set(listId, watchedQuery({ data: items }));
	}
	for (const [listId, error] of Object.entries(
		input.itemErrorsByListId ?? {},
	)) {
		itemResults.set(listId, watchedQuery({ data: [], error }));
	}
}

function watchedQuery<T>(input: {
	data: T[];
	isLoading?: boolean;
	isFetching?: boolean;
	error?: Error;
}): WatchedQueryResult<T> {
	return {
		data: input.data,
		isLoading: input.isLoading ?? false,
		isFetching: input.isFetching ?? false,
		error: input.error,
	};
}

function productServices(): ProductServices {
	const unused = jest.fn(async () => {
		throw new Error("unexpected service call");
	});
	return {
		lists: {
			listLists: unused,
			listListsQuery: jest.fn(() => listSummariesQuery),
			createList: unused,
			renameList: unused,
			deleteList: unused,
		},
		items: {
			listItems: unused,
			listItemsQuery: jest.fn((input: ListItemsInput) =>
				itemQuery(input.listId),
			),
			addItem: unused,
			setItemChecked: unused,
		},
	};
}

function itemQuery(listId: string): ItemQuery {
	const query = {
		listId,
		compile: () => ({ sql: "SELECT items", parameters: [listId] }),
		execute: async () => itemResults.get(listId)?.data ?? [],
	};
	itemQueryListIds.set(query, listId);
	return query;
}

function queryObject(query: unknown): object | null {
	return typeof query === "object" && query !== null ? query : null;
}

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_1", name: "Home" },
		households: [],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery",
		},
		members: [
			{
				membershipId: "mbr_blake",
				userId: "usr_blake",
				role: "member",
				displayName: "Blake",
			},
		],
	};
}

function summary(id: string, name = id): ListSummary {
	return {
		id,
		householdId: "hh_1",
		name,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
		archived: false,
		archivedAt: null,
		lastActivityAt: 1,
		uncheckedItemCount: 0,
		checkedItemCount: 0,
	};
}

function item(id: string, listId: string): Item {
	return {
		id,
		householdId: "hh_1",
		listId,
		name: id,
		quantity: null,
		notes: null,
		checked: false,
		checkedByUserId: null,
		position: 0,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
	};
}

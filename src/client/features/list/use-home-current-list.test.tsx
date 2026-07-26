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

beforeEach(() => {
	summariesResult = watchedQuery({ data: [] });
	mockGetSelection.mockResolvedValue(null);
	mockClearSelection.mockResolvedValue(false);
	mockUseProductServices.mockReturnValue(productServices());
	// The resolver owns the selected List id only; Items belong to the List
	// pages. Anything else it watches would gate Home on a single List's rows.
	mockUseQuery.mockImplementation((query) => {
		if (query === listSummariesQuery) {
			return summariesResult;
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
		});

		expect(await screen.findByText("active:lst_pantry")).toBeTruthy();
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
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection after fresh List summaries emit and falls back without persisting the fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		const view = await renderHomeCurrentList({
			summaries: [],
			summariesIsLoading: true,
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

	it("clears an invalid stored selection when List summaries settled before the selection read", async () => {
		let resolveSelection: (value: string | null) => void = () => {};
		const pendingSelection = new Promise<string | null>((resolve) => {
			resolveSelection = resolve;
		});
		mockGetSelection.mockReturnValue(pendingSelection);
		await renderHomeCurrentList({
			summaries: [summary("lst_recent", "Recent")],
		});

		expect(screen.getByText("loading")).toBeTruthy();

		await act(async () => {
			resolveSelection("lst_gone");
		});

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

	it("resolves the selected List without watching its Items", async () => {
		// Folding a List's Items query into this state is what used to unmount
		// Home's whole List pager, and its picker with it, when one List's rows
		// failed to read. Each List page watches its own Items instead.
		await renderHomeCurrentList({ summaries: [summary("lst_recent")] });

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		expect(mockUseQuery).toHaveBeenCalledWith(listSummariesQuery);
		for (const [query] of mockUseQuery.mock.calls) {
			expect(query).toBe(listSummariesQuery);
		}
	});

	it("logs a clear failure and keeps rendering the active fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		mockClearSelection.mockRejectedValue(new Error("storage offline"));
		const view = await renderHomeCurrentList({
			summaries: [],
			summariesIsLoading: true,
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
});

function HomeCurrentListHarness({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const { state } = useHomeCurrentList(session);
	if (state.status === "active") {
		return <Text>{`active:${state.listId}`}</Text>;
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
};

function arrangeWatchedQueries(input: WatchedQueryFixture) {
	summariesResult = watchedQuery({
		data: input.summaries,
		isLoading: input.summariesIsLoading,
		isFetching: input.summariesIsFetching,
		error: input.summariesError,
	});
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
			listItemsQuery: jest.fn(() => {
				throw new Error("the Current List resolver must not watch Items");
			}),
			addItem: unused,
			setItemChecked: unused,
		},
	};
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

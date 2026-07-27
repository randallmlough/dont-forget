import { act, renderHook, waitFor } from "@testing-library/react-native";
import type {
	CreateListResult,
	DeleteListResult,
	ListSummary,
	RenameListResult,
} from "@/client/features/list/list-service";
import { track } from "@/client/lib/analytics";
import { logger } from "@/client/lib/logger";
import type { ProductQuery } from "@/client/lib/product-database";
import {
	type ProductQueryResult,
	useProductQuery,
} from "@/client/lib/use-product-query";
import type { AuthenticatedAppSession } from "@/client/session";
import { deferred } from "@/test/async";
import { useListCollection } from "./use-list-collection";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

// The watched-query seam owns retry re-keying and proves it in its own suite;
// here it stands in for the PowerSync boundary the collection reads through.
jest.mock("@/client/lib/use-product-query", () => ({
	useProductQuery: jest.fn(),
}));
jest.mock("./use-product-services", () => ({
	useProductServices: jest.fn(),
}));
jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);
jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

const LIST_ERROR_MESSAGE = "Unable to load your Lists. Please try again.";
const mockUseProductQuery = jest.mocked(useProductQuery);
const mockUseProductServices = jest.mocked(useProductServices);
const mockTrack = jest.mocked(track);
const mockLogger = jest.mocked(logger);
const listListsQuery: ProductQuery<ListSummary> = {
	compile: () => ({ sql: "SELECT lists", parameters: [] }),
	execute: jest.fn(async (): Promise<ListSummary[]> => []),
};
const queryRetry = jest.fn();
const summaries = [summary("lst_recent"), summary("lst_pantry")];
let queryState: ProductQueryResult<ListSummary>;
let services: ProductServices;
let listLists: jest.Mock;
let createList: jest.Mock;
let renameList: jest.Mock;
let deleteList: jest.Mock;
// The collection reads and writes the Current List through the selection store
// on its product services, so the fake store below is the whole storage seam.
let mockGetSelection: jest.Mock;
let mockSetSelection: jest.Mock;
let mockClearSelection: jest.Mock;
let mockClearIfMatches: jest.Mock;

beforeEach(() => {
	mockGetSelection = jest.fn(async (): Promise<string | null> => null);
	mockSetSelection = jest.fn(async (): Promise<void> => {});
	mockClearSelection = jest.fn(async (): Promise<void> => {});
	mockClearIfMatches = jest.fn(async (): Promise<boolean> => false);
	mockTrack.mockClear();
	mockLogger.error.mockClear();
	listLists = jest.fn(async () => summaries);
	createList = jest.fn(
		async (): Promise<CreateListResult> => ({
			status: "available",
			list: listFixture("lst_created"),
			didWrite: true,
		}),
	);
	renameList = jest.fn(
		async (): Promise<RenameListResult> => ({
			status: "available",
			list: listFixture("lst_pantry"),
			didWrite: true,
		}),
	);
	deleteList = jest.fn(
		async (): Promise<DeleteListResult> => ({
			status: "deleted",
			listId: "lst_recent",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: true,
		}),
	);
	services = productServices();
	mockUseProductServices.mockReturnValue(services);
	arrangeQuery({ data: summaries });
	mockUseProductQuery.mockImplementation(() => queryState);
});

afterEach(() => {
	jest.clearAllMocks();
});

describe("useListCollection summaries query", () => {
	it("watches active recent summaries and resolves a stored Current List", async () => {
		mockGetSelection.mockResolvedValue("lst_pantry");
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "active",
				summaries,
				currentListId: "lst_pantry",
			}),
		);
		expect(services.lists.listListsQuery).toHaveBeenCalledWith({
			archive: "active",
			sort: "recentActivity",
		});
		expect(mockUseProductQuery).toHaveBeenCalled();
	});

	it("returns loading while the watched query is loading", async () => {
		arrangeQuery({ data: [], isLoading: true, isFetching: true });
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));
		expect(result.current.state).toEqual({ status: "loading" });
	});

	it("maps watched query data to ready summaries", async () => {
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "active",
				summaries,
				currentListId: "lst_recent",
			}),
		);
	});

	it("maps a watched query error to the error state", async () => {
		arrangeQuery({ data: summaries, error: new Error("db unavailable") });
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "error",
				message: LIST_ERROR_MESSAGE,
			}),
		);
	});

	it("builds the active recent-activity summaries query and passes it to the product query", async () => {
		await renderCollection();
		expect(services.lists.listListsQuery).toHaveBeenCalledWith({
			archive: "active",
			sort: "recentActivity",
		});
		expect(mockUseProductQuery).toHaveBeenCalledWith(listListsQuery);
	});

	it("creates product services for the active Household and User", async () => {
		// The summaries this collection watches are scoped to the Household and
		// User the services are built for, and Current List resolution reads them
		// from here rather than opening a query of its own.
		await renderCollection();
		expect(mockUseProductServices).toHaveBeenCalledWith({
			householdId: "hh_1",
			userId: "usr_avery",
		});
	});

	it("maps query loading, error, and zero-active states", async () => {
		const { result, rerender } = await renderCollection();
		arrangeQuery({ data: [], isLoading: true });
		await rerender(undefined);
		expect(result.current.state).toEqual({ status: "loading" });
		arrangeQuery({ data: [], error: new Error("offline") });
		await rerender(undefined);
		expect(result.current.state).toEqual({
			status: "error",
			message: LIST_ERROR_MESSAGE,
		});
		arrangeQuery({ data: [] });
		await rerender(undefined);
		expect(result.current.state).toEqual({ status: "zeroActive" });
	});

	it("retries and recovers a failed summaries query without rereading selection", async () => {
		arrangeQuery({ data: [], error: new Error("offline") });
		const { result, rerender } = await renderCollection();
		await act(async () => result.current.actions.retry());
		// Re-keying the failed query is the watched-query seam's job; the
		// collection only forwards its retry and never re-reads stored selection.
		expect(queryRetry).toHaveBeenCalledTimes(1);
		arrangeQuery({ data: summaries });
		await rerender(undefined);
		expect(result.current.state.status).toBe("active");
		expect(mockGetSelection).toHaveBeenCalledTimes(1);
	});
});

describe("useListCollection Current List resolution", () => {
	it("reports resolvingCurrentList while the first storage read is pending", async () => {
		const pending = deferred<string | null>();
		mockGetSelection.mockReturnValue(pending.promise);
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "resolvingCurrentList",
				summaries,
			}),
		);
	});

	it("reports loading while active List summaries are loading", async () => {
		arrangeQuery({ data: [], isLoading: true });
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));
		expect(result.current.state).toEqual({ status: "loading" });
	});

	it("resolves the stored selection when it is an active List", async () => {
		mockGetSelection.mockResolvedValue("lst_pantry");
		arrangeQuery({ data: [summary("lst_groceries"), summary("lst_pantry")] });
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_pantry",
			}),
		);
		expect(mockClearIfMatches).not.toHaveBeenCalled();
	});

	it("falls back in memory to the most recently active List when nothing is stored", async () => {
		mockGetSelection.mockResolvedValue(null);
		// Summaries are queried sort: recentActivity, so index 0 is most recent.
		arrangeQuery({ data: [summary("lst_recent"), summary("lst_older")] });
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		expect(mockClearIfMatches).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection after fresh List summaries emit and falls back without persisting the fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		arrangeQuery({ data: [], isLoading: true });
		const { result, rerender } = await renderCollection();
		expect(result.current.state).toEqual({ status: "loading" });
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			rerender(undefined);
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await waitFor(() =>
			expect(mockClearIfMatches).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_gone",
			),
		);
		expect(mockSetSelection).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection when List summaries settled before the selection read", async () => {
		const pending = deferred<string | null>();
		mockGetSelection.mockReturnValue(pending.promise);
		arrangeQuery({ data: [summary("lst_recent")] });
		const { result } = await renderCollection();

		expect(result.current.state).toMatchObject({
			status: "resolvingCurrentList",
		});

		await act(async () => {
			pending.resolve("lst_gone");
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await waitFor(() =>
			expect(mockClearIfMatches).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_gone",
			),
		);
	});

	it("reports zero-active when there are no active Lists", async () => {
		arrangeQuery({ data: [] });
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toEqual({ status: "zeroActive" }),
		);
	});

	it("maps a summaries query error to the List error state", async () => {
		arrangeQuery({ data: [], error: new Error("lists failed") });
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "error",
				message: LIST_ERROR_MESSAGE,
			}),
		);
	});

	it("logs a clear failure and keeps rendering the active fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		mockClearIfMatches.mockRejectedValue(new Error("storage offline"));
		arrangeQuery({ data: [], isLoading: true });
		const { result, rerender } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			rerender(undefined);
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"current List selection clear failed",
				{ error: expect.any(Error) },
			),
		);
	});

	it("logs a selection read failure and renders the most recently active List", async () => {
		mockGetSelection.mockRejectedValue(new Error("storage offline"));
		arrangeQuery({ data: [summary("lst_recent")] });
		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		expect(mockLogger.error).toHaveBeenCalledWith(
			"current List selection read failed",
			{ error: expect.any(Error) },
		);
	});

	it("a selection refresh re-reads the stored selection and renders the newly selected List", async () => {
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		arrangeQuery({ data: [summary("lst_recent"), summary("lst_pantry")] });
		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await result.current.actions.selectList({ listId: "lst_pantry" });
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_pantry",
			}),
		);
		expect(mockGetSelection).toHaveBeenCalledTimes(2);
	});

	it("keeps serving the resolved Current List while a refresh read is in flight", async () => {
		const refresh = deferred<string | null>();
		mockGetSelection
			.mockResolvedValueOnce("lst_recent")
			.mockReturnValueOnce(refresh.promise);
		arrangeQuery({ data: [summary("lst_recent"), summary("lst_pantry")] });
		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await result.current.actions.selectList({ listId: "lst_pantry" });
		});

		// Reporting loading here would unmount Home's List pager and flash a
		// full-screen spinner over a page switch that already landed.
		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});

		await act(async () => {
			refresh.resolve("lst_pantry");
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_pantry",
		});
	});

	it("clears a refreshed stored selection once that List stops being active", async () => {
		mockGetSelection
			.mockResolvedValueOnce("lst_recent")
			.mockResolvedValueOnce("lst_pantry");
		arrangeQuery({ data: [summary("lst_recent"), summary("lst_pantry")] });
		const { result, rerender } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await result.current.actions.selectList({ listId: "lst_pantry" });
		});
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_pantry",
			}),
		);

		// Another Member archives the switched-to List while Home stays mounted.
		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			rerender(undefined);
		});

		await waitFor(() =>
			expect(mockClearIfMatches).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_pantry",
			),
		);
		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
	});

	it("does not clear a refreshed stored selection before List summaries emit after the refresh", async () => {
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		arrangeQuery({ data: [summary("lst_recent")] });
		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		mockClearIfMatches.mockClear();

		await act(async () => {
			await result.current.actions.selectList({ listId: "lst_pantry" });
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		expect(mockClearIfMatches).not.toHaveBeenCalled();
	});

	it("does not clear an absent stored selection while summaries are fetching", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		arrangeQuery({ data: [], isLoading: true });
		const { rerender } = await renderCollection();

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")], isFetching: true });
			rerender(undefined);
		});

		expect(mockClearIfMatches).not.toHaveBeenCalled();
	});
});

describe("useListCollection selectList", () => {
	it("persists selection before tracking and refreshes after success", async () => {
		const write = deferred<void>();
		mockSetSelection.mockReturnValue(write.promise);
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));
		let outcome: Promise<unknown> = Promise.resolve();
		await act(async () => {
			outcome = result.current.actions.selectList({ listId: "lst_pantry" });
			expect(mockSetSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_pantry",
			);
			expect(mockTrack).not.toHaveBeenCalled();
			write.resolve();
			await outcome;
		});
		await expect(outcome).resolves.toEqual({ status: "selected" });
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_1",
			list_id: "lst_pantry",
			user_id: "usr_avery",
		});
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
	});

	it("returns semantic selection failures and blocks concurrent writes", async () => {
		const write = deferred<void>();
		mockSetSelection.mockReturnValue(write.promise);
		// The store honours the write: the refresh read after a successful switch
		// returns the List that was just persisted.
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({ status: "active" }),
		);
		let first: Promise<unknown> = Promise.resolve();
		await act(async () => {
			first = result.current.actions.selectList({ listId: "lst_pantry" });
			await expect(
				result.current.actions.selectList({ listId: "lst_created" }),
			).resolves.toEqual({
				status: "notSelected",
				reason: "busy",
				currentListId: "lst_recent",
			});
			write.resolve();
			await first;
		});
		await expect(first).resolves.toEqual({ status: "selected" });
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_pantry",
			}),
		);
		mockSetSelection.mockRejectedValueOnce(new Error("offline"));
		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_recent" }),
			).resolves.toEqual({
				status: "notSelected",
				reason: "selectionFailed",
				currentListId: "lst_pantry",
			});
		});
	});

	it("returns a selection failure and allows a later switch", async () => {
		mockSetSelection
			.mockRejectedValueOnce(new Error("write failed"))
			.mockResolvedValueOnce(undefined);
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_pantry" }),
			).resolves.toEqual({
				status: "notSelected",
				reason: "selectionFailed",
				currentListId: "lst_recent",
			});
		});
		expect(mockTrack).not.toHaveBeenCalled();

		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_bakery" }),
			).resolves.toEqual({ status: "selected" });
		});
		expect(mockSetSelection).toHaveBeenNthCalledWith(
			2,
			"usr_avery",
			"hh_1",
			"lst_bakery",
		);
		expect(mockTrack).toHaveBeenCalledTimes(1);
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_1",
			list_id: "lst_bakery",
			user_id: "usr_avery",
		});
	});

	it("ignores selecting the Current List", async () => {
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await expect(
			result.current.actions.selectList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "alreadyCurrent" });
		expect(mockSetSelection).not.toHaveBeenCalled();
		expect(mockTrack).not.toHaveBeenCalled();
	});

	it("ignores a second selection while persistence is unresolved", async () => {
		const write = deferred<void>();
		mockSetSelection.mockReturnValue(write.promise);
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({ status: "active" }),
		);

		let firstSelection: Promise<unknown> = Promise.resolve();
		await act(async () => {
			firstSelection = result.current.actions.selectList({
				listId: "lst_pantry",
			});
			await expect(
				result.current.actions.selectList({ listId: "lst_bakery" }),
			).resolves.toEqual({
				status: "notSelected",
				reason: "busy",
				currentListId: "lst_recent",
			});

			expect(mockSetSelection).toHaveBeenCalledTimes(1);
			expect(mockTrack).not.toHaveBeenCalled();

			write.resolve();
			await firstSelection;
		});

		await expect(firstSelection).resolves.toEqual({ status: "selected" });
		expect(mockTrack).toHaveBeenCalledTimes(1);
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_1",
			list_id: "lst_pantry",
			user_id: "usr_avery",
		});
	});

	it("compares successful consecutive selections against the immediately updated internal ref", async () => {
		const refresh = deferred<string | null>();
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockReturnValueOnce(refresh.promise);
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_pantry" }),
			).resolves.toEqual({ status: "selected" });
		});

		// The refresh read has not resolved, so the published state still names
		// the old Current List while the internal ref already names the new one.
		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await expect(
			result.current.actions.selectList({ listId: "lst_pantry" }),
		).resolves.toEqual({ status: "alreadyCurrent" });
		expect(mockSetSelection).toHaveBeenCalledTimes(1);

		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "selected" });
		});
		expect(mockSetSelection).toHaveBeenNthCalledWith(
			2,
			"usr_avery",
			"hh_1",
			"lst_recent",
		);
	});

	it("releases the internal Current List ref when the selected List stops being active before the refreshed read", async () => {
		const refresh = deferred<string | null>();
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockReturnValueOnce(refresh.promise);
		arrangeQuery({ data: [summary("lst_recent"), summary("lst_pantry")] });
		const { result, rerender } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_pantry" }),
			).resolves.toEqual({ status: "selected" });
		});

		// Another Member deletes the switched-to List before the refreshed read
		// lands, so that read can never make it the derived Current List.
		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			rerender(undefined);
		});
		await act(async () => {
			refresh.resolve("lst_pantry");
		});
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		mockSetSelection.mockClear();
		mockTrack.mockClear();
		// The ref names the List on screen again, so selecting it writes nothing
		// and reports no switch...
		await expect(
			result.current.actions.selectList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "alreadyCurrent" });
		expect(mockSetSelection).not.toHaveBeenCalled();
		expect(mockTrack).not.toHaveBeenCalled();

		// ...and deleting it still repairs the Current List to a remaining one.
		listLists.mockResolvedValueOnce([summary("lst_bakery")]);
		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});
		expect(mockSetSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_1",
			"lst_bakery",
		);
	});
});

describe("useListCollection createList", () => {
	it("creates and selects without emitting a switch event", async () => {
		const { result } = await renderCollection();
		await act(async () => {
			await expect(
				result.current.actions.createList({ name: "Hardware" }),
			).resolves.toEqual({
				status: "createdAndSelected",
				listId: "lst_created",
			});
		});
		expect(mockSetSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_1",
			"lst_created",
		);
		expect(mockTrack).not.toHaveBeenCalled();
	});

	it("updates the internal Current List ref and refreshes selection after create", async () => {
		// The created List is Current the moment the write lands; the refresh read
		// is still in flight, so only the internal ref can say so.
		const refresh = deferred<string | null>();
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockReturnValueOnce(refresh.promise);
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			await result.current.actions.createList({ name: "Hardware" });
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
		await expect(
			result.current.actions.selectList({ listId: "lst_created" }),
		).resolves.toEqual({ status: "alreadyCurrent" });
	});

	it("keeps the created List when persisting the selection fails", async () => {
		mockSetSelection.mockRejectedValueOnce(new Error("storage offline"));
		const { result } = await renderCollection();

		await act(async () => {
			await expect(
				result.current.actions.createList({ name: "Hardware" }),
			).resolves.toEqual({
				status: "createdSelectionFailed",
				listId: "lst_created",
			});
		});
		expect(createList).toHaveBeenCalledWith({ name: "Hardware" });
		expect(mockTrack).not.toHaveBeenCalled();
		// The created List never became Current, so selecting it still writes.
		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_created" }),
			).resolves.toEqual({ status: "selected" });
		});
	});

	it("passes Create and Rename service outcomes through semantic mappings", async () => {
		createList.mockResolvedValueOnce({
			status: "invalidName",
			reason: "required",
			didWrite: false,
		});
		const { result } = await renderCollection();
		await expect(
			result.current.actions.createList({ name: "" }),
		).resolves.toEqual({ status: "invalidName", reason: "required" });
		createList.mockRejectedValueOnce(new Error("offline"));
		await expect(
			result.current.actions.createList({ name: "Hardware" }),
		).resolves.toEqual({ status: "failed" });
		renameList.mockResolvedValueOnce({
			status: "available",
			list: listFixture("lst_pantry"),
			didWrite: false,
		});
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "Pantry",
			}),
		).resolves.toEqual({ status: "unchanged" });
	});
});

describe("useListCollection renameList", () => {
	it("maps a written rename to renamed", async () => {
		const { result } = await renderCollection();
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "Pantry Staples",
			}),
		).resolves.toEqual({ status: "renamed" });
		expect(renameList).toHaveBeenCalledWith({
			listId: "lst_pantry",
			name: "Pantry Staples",
		});
	});

	it("maps an invalid rename name to its validation reason", async () => {
		renameList.mockResolvedValueOnce({
			status: "invalidName",
			reason: "tooLong",
			didWrite: false,
		});
		const { result } = await renderCollection();
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "x".repeat(200),
			}),
		).resolves.toEqual({ status: "invalidName", reason: "tooLong" });
	});

	it("maps missing and deleted renames to gone", async () => {
		renameList.mockResolvedValueOnce({
			status: "missing",
			listId: "lst_pantry",
			didWrite: false,
		});
		const { result } = await renderCollection();
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "Pantry",
			}),
		).resolves.toEqual({ status: "gone" });

		renameList.mockResolvedValueOnce({
			status: "deleted",
			listId: "lst_pantry",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: false,
		});
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "Pantry",
			}),
		).resolves.toEqual({ status: "gone" });
	});

	it("maps a rename service throw to failed", async () => {
		renameList.mockRejectedValueOnce(new Error("offline"));
		const { result } = await renderCollection();
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "Pantry",
			}),
		).resolves.toEqual({ status: "failed" });
	});
});

describe("useListCollection deleteList", () => {
	it("repairs a deleted Current List to the first remaining List", async () => {
		mockGetSelection.mockResolvedValue("lst_recent");
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));
		// listLists({ archive: "active" }) filters deleted Lists, so the repair read
		// after deleting lst_recent can only see what is left.
		listLists.mockResolvedValueOnce([summary("lst_pantry")]);
		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});
		expect(listLists).toHaveBeenCalledWith({
			archive: "active",
			sort: "recentActivity",
		});
		expect(mockSetSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_1",
			"lst_pantry",
		);
		expect(mockTrack).not.toHaveBeenCalled();
	});

	it("does not repair non-current deletion and clears an only Current List", async () => {
		const { result } = await renderCollection();
		await expect(
			result.current.actions.deleteList({ listId: "lst_pantry" }),
		).resolves.toEqual({ status: "deleted" });
		expect(listLists).not.toHaveBeenCalled();
		listLists.mockResolvedValueOnce([]);
		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});
		expect(mockClearSelection).toHaveBeenCalledWith("usr_avery", "hh_1");
	});

	it("keeps deletion best-effort and refreshes after repair failures", async () => {
		listLists.mockRejectedValueOnce(new Error("read failed"));
		const { result } = await renderCollection();
		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});
		// The repair read failed, so the live summaries resolver has to fall back;
		// the private selection refresh is what lets it re-read and stale-clear.
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
		deleteList.mockResolvedValueOnce({
			status: "missing",
			listId: "lst_recent",
			didWrite: false,
		});
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "gone" });
	});

	it("refreshes without rewriting storage when the Current List deletion did not write", async () => {
		deleteList.mockResolvedValueOnce({
			status: "deleted",
			listId: "lst_recent",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: false,
		});
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expect(listLists).not.toHaveBeenCalled();
		expect(mockSetSelection).not.toHaveBeenCalled();
		expect(mockClearSelection).not.toHaveBeenCalled();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
	});

	it("keeps a failed fallback write best-effort and still refreshes", async () => {
		mockSetSelection.mockRejectedValueOnce(new Error("write failed"));
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));
		listLists.mockResolvedValueOnce([summary("lst_pantry")]);

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expect(listLists).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
	});

	it("keeps a failed selection clear best-effort and still refreshes", async () => {
		listLists.mockResolvedValueOnce([]);
		mockClearSelection.mockRejectedValueOnce(new Error("clear failed"));
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expect(mockClearSelection).toHaveBeenCalledWith("usr_avery", "hh_1");
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
	});

	it("maps a delete service throw to failed", async () => {
		deleteList.mockRejectedValueOnce(new Error("offline"));
		const { result } = await renderCollection();
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "failed" });
		expect(listLists).not.toHaveBeenCalled();
	});
});

function renderCollection() {
	return renderHook(() => useListCollection(sessionFixture()));
}

function arrangeQuery(input: {
	data: ListSummary[];
	isLoading?: boolean;
	isFetching?: boolean;
	error?: Error;
}) {
	queryState = {
		data: input.data,
		isLoading: input.isLoading ?? false,
		isFetching: input.isFetching ?? false,
		error: input.error,
		retry: queryRetry,
	};
}

function productServices(): ProductServices {
	return {
		lists: {
			listLists,
			listListsQuery: jest.fn(() => listListsQuery),
			createList,
			renameList,
			deleteList,
		},
		items: {
			listItems: jest.fn(),
			listItemsQuery: jest.fn(() => ({
				compile: () => ({ sql: "SELECT items", parameters: [] }),
				execute: async () => [],
			})),
			addItem: jest.fn(),
			setItemChecked: jest.fn(),
		},
		currentListSelection: {
			getCurrentListSelection: mockGetSelection,
			setCurrentListSelection: mockSetSelection,
			clearCurrentListSelection: mockClearSelection,
			clearCurrentListSelectionIfMatches: mockClearIfMatches,
			clearUserCurrentListSelections: jest.fn(),
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
		members: [],
	};
}

function summary(id: string): ListSummary {
	return {
		id,
		householdId: "hh_1",
		name: id,
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

function listFixture(id: string) {
	return {
		id,
		householdId: "hh_1",
		name: id,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
		archived: false,
		archivedAt: null,
	};
}

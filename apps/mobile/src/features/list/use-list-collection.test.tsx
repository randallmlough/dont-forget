import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ListSummary } from "@mobile/features/list/list-service";
import { track } from "@mobile/lib/analytics";
import { logger } from "@mobile/lib/logger";
import type { ProductQuery } from "@mobile/lib/product-database";
import {
	type ProductQueryResult,
	useProductQuery,
} from "@mobile/lib/use-product-query";
import type { AuthenticatedAppSession } from "@mobile/session";
import { deferred } from "@mobile/test/async";
import {
	createTestProductDatabase,
	type TestProductDatabase,
} from "@mobile/test/product-database";
import { useListCollection } from "./use-list-collection";

// The watched-query seam owns retry re-keying and proves it in its own suite;
// here it stands in for the PowerSync boundary the collection reads through.
jest.mock("@mobile/lib/use-product-query", () => ({
	useProductQuery: jest.fn(),
}));
jest.mock("@mobile/session/powersync-app-database", () => ({
	appProductDatabase: {
		getAll: (...args: Parameters<TestProductDatabase["getAll"]>) =>
			mockProductDatabase().getAll(...args),
		getOptional: (...args: Parameters<TestProductDatabase["getOptional"]>) =>
			mockProductDatabase().getOptional(...args),
		execute: (...args: Parameters<TestProductDatabase["execute"]>) =>
			mockProductDatabase().execute(...args),
		writeTransaction: (
			...args: Parameters<TestProductDatabase["writeTransaction"]>
		) => mockProductDatabase().writeTransaction(...args),
	},
}));
jest.mock("@mobile/lib/analytics", () =>
	jest.requireActual("@mobile/test/mocks/analytics"),
);
jest.mock("@mobile/lib/logger", () =>
	jest
		.requireActual<typeof import("@mobile/test/mocks/logger")>(
			"@mobile/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

const LIST_ERROR_MESSAGE = "Unable to load your Lists. Please try again.";
const HOUSEHOLD_ID = "hh_1";
const USER_ID = "usr_avery";
const STORAGE_KEY = `dont-forget:current-list-selection:v1:${USER_ID}`;

const mockUseProductQuery = jest.mocked(useProductQuery);
const mockTrack = jest.mocked(track);
const mockLogger = jest.mocked(logger);
const mockGetItem = jest.mocked(AsyncStorage.getItem);
const mockSetItem = jest.mocked(AsyncStorage.setItem);
const mockRemoveItem = jest.mocked(AsyncStorage.removeItem);
const queryRetry = jest.fn();
const defaultSummaries = [summary("lst_recent"), summary("lst_pantry")];

let queryState: ProductQueryResult<ListSummary>;
let testProductDatabase: TestProductDatabase | null = null;
let storage: Map<string, string>;

function mockProductDatabase(): TestProductDatabase {
	if (!testProductDatabase) {
		throw new Error("test product database not initialized");
	}
	return testProductDatabase;
}

beforeEach(() => {
	storage = new Map();
	testProductDatabase = createTestProductDatabase();
	seedDefaultLists();
	mockAsyncStorageWithMap();
	mockTrack.mockClear();
	mockLogger.error.mockClear();
	queryRetry.mockClear();
	arrangeQuery({ data: defaultSummaries });
	mockUseProductQuery.mockImplementation(() => queryState);
});

afterEach(() => {
	testProductDatabase?.close();
	testProductDatabase = null;
	jest.clearAllMocks();
});

describe("useListCollection summaries query", () => {
	it("watches active recent summaries and resolves a stored Current List", async () => {
		setStoredSelection("lst_pantry");

		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "active",
				summaries: defaultSummaries,
				currentListId: "lst_pantry",
			}),
		);
		expectProductQueryCompiledForActiveRecentLists();
	});

	it("returns loading while the watched query is loading", async () => {
		arrangeQuery({ data: [], isLoading: true, isFetching: true });

		const { result } = await renderCollection();

		await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));
		expect(result.current.state).toEqual({ status: "loading" });
	});

	it("maps watched query data to ready summaries", async () => {
		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "active",
				summaries: defaultSummaries,
				currentListId: "lst_recent",
			}),
		);
	});

	it("maps a watched query error to the error state", async () => {
		arrangeQuery({
			data: defaultSummaries,
			error: new Error("db unavailable"),
		});

		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "error",
				message: LIST_ERROR_MESSAGE,
			}),
		);
	});

	it("passes a real active recent-activity summaries query to the product query", async () => {
		await renderCollection();

		expectProductQueryCompiledForActiveRecentLists();
		const query = mockUseProductQuery.mock.calls[0]?.[0];
		await expect(query?.execute()).resolves.toEqual(defaultSummaries);
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
		await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

		await act(async () => result.current.actions.retry());
		arrangeQuery({ data: defaultSummaries });
		await rerender(undefined);

		expect(queryRetry).toHaveBeenCalledTimes(1);
		expect(result.current.state.status).toBe("active");
		expect(mockGetItem).toHaveBeenCalledTimes(1);
	});
});

describe("useListCollection Current List resolution", () => {
	it("reports resolvingCurrentList while the first storage read is pending", async () => {
		const pending = deferred<string | null>();
		mockGetItem.mockReturnValue(pending.promise);

		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toEqual({
				status: "resolvingCurrentList",
				summaries: defaultSummaries,
			}),
		);
	});

	it("resolves the stored selection when it is an active List", async () => {
		setStoredSelection("lst_pantry");

		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_pantry",
			}),
		);
		expectStoredSelection("lst_pantry");
	});

	it("falls back in memory to the most recently active List when nothing is stored", async () => {
		arrangeQuery({ data: [summary("lst_recent"), summary("lst_older")] });

		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		expectStoredSelection(null);
	});

	it("clears an invalid stored selection after fresh List summaries emit and falls back without persisting the fallback", async () => {
		setStoredSelection("lst_gone");
		arrangeQuery({ data: [], isLoading: true });
		const { result, rerender } = await renderCollection();
		await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			await rerender(undefined);
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await waitFor(() => expectStoredSelection(null));
		expect(mockSetItem).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection when List summaries settled before the selection read", async () => {
		const pending = deferred<string | null>();
		mockGetItem.mockReturnValueOnce(pending.promise);
		arrangeQuery({ data: [summary("lst_recent")] });
		const { result } = await renderCollection();

		expect(result.current.state).toMatchObject({
			status: "resolvingCurrentList",
		});

		await act(async () => {
			pending.resolve(JSON.stringify({ [HOUSEHOLD_ID]: "lst_gone" }));
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await waitFor(() => expectStoredSelection(null));
	});

	it("reports zero-active when there are no active Lists", async () => {
		arrangeQuery({ data: [] });

		const { result } = await renderCollection();

		await waitFor(() =>
			expect(result.current.state).toEqual({ status: "zeroActive" }),
		);
	});

	it("logs a clear failure and keeps rendering the active fallback", async () => {
		setStoredSelection("lst_gone");
		mockRemoveItem.mockRejectedValueOnce(new Error("storage offline"));
		arrangeQuery({ data: [], isLoading: true });
		const { result, rerender } = await renderCollection();
		await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			await rerender(undefined);
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
		mockGetItem.mockRejectedValueOnce(new Error("storage offline"));

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
		expectStoredSelection("lst_pantry");
	});

	it("keeps serving the resolved Current List while a refresh read is in flight", async () => {
		const refresh = deferred<string | null>();
		const defaultGetItem = mockGetItem.getMockImplementation();
		mockGetItem
			.mockResolvedValueOnce(JSON.stringify({ [HOUSEHOLD_ID]: "lst_recent" }))
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockReturnValueOnce(refresh.promise);
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

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});

		await act(async () => {
			refresh.resolve(JSON.stringify({ [HOUSEHOLD_ID]: "lst_pantry" }));
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_pantry",
		});
	});

	it("clears a refreshed stored selection once that List stops being active", async () => {
		setStoredSelection("lst_recent");
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

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			await rerender(undefined);
		});

		await waitFor(() => expectStoredSelection(null));
		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
	});

	it("does not clear a refreshed stored selection before List summaries emit after the refresh", async () => {
		arrangeQuery({ data: [summary("lst_recent")] });
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

		await waitFor(() => expectStoredSelection("lst_pantry"));
		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			await rerender(undefined);
		});

		await waitFor(() => expectStoredSelection(null));
	});

	it("does not clear an absent stored selection while summaries are fetching", async () => {
		setStoredSelection("lst_gone");
		arrangeQuery({ data: [], isLoading: true });
		const { rerender } = await renderCollection();
		await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")], isFetching: true });
			await rerender(undefined);
		});

		expectStoredSelection("lst_gone");
	});
});

describe("useListCollection selectList", () => {
	it("persists selection before tracking and refreshes after success", async () => {
		const write = deferred<void>();
		mockSetItem.mockImplementation((key, value) =>
			write.promise.then(() => {
				storage.set(key, value);
			}),
		);
		const { result } = await renderCollection();
		await waitFor(() => expect(mockGetItem).toHaveBeenCalledTimes(1));

		let outcome: Promise<unknown> = Promise.resolve();
		await act(async () => {
			outcome = result.current.actions.selectList({ listId: "lst_pantry" });
			expect(mockTrack).not.toHaveBeenCalled();
			write.resolve();
			await outcome;
		});

		await expect(outcome).resolves.toEqual({ status: "selected" });
		expectStoredSelection("lst_pantry");
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: HOUSEHOLD_ID,
			list_id: "lst_pantry",
			user_id: USER_ID,
		});
	});

	it("returns semantic selection failures and blocks concurrent writes", async () => {
		const write = deferred<void>();
		mockSetItem.mockImplementation((key, value) =>
			write.promise.then(() => {
				storage.set(key, value);
			}),
		);
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

		mockSetItem.mockRejectedValueOnce(new Error("offline"));
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
		mockSetItem
			.mockRejectedValueOnce(new Error("write failed"))
			.mockImplementation((key, value) => {
				storage.set(key, value);
				return Promise.resolve();
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
		expectStoredSelection("lst_bakery");
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: HOUSEHOLD_ID,
			list_id: "lst_bakery",
			user_id: USER_ID,
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
		expectStoredSelection(null);
		expect(mockTrack).not.toHaveBeenCalled();
	});

	it("compares successful consecutive selections against the immediately updated internal ref", async () => {
		const refresh = deferred<string | null>();
		const defaultGetItem = mockGetItem.getMockImplementation();
		mockGetItem
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockReturnValueOnce(refresh.promise)
			.mockImplementation(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			);
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

		expect(result.current.state).toMatchObject({
			status: "active",
			currentListId: "lst_recent",
		});
		await expect(
			result.current.actions.selectList({ listId: "lst_pantry" }),
		).resolves.toEqual({ status: "alreadyCurrent" });

		await act(async () => {
			await expect(
				result.current.actions.selectList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "selected" });
		});
		expectStoredSelection("lst_recent");
	});

	it("releases the internal Current List ref when the selected List stops being active before the refreshed read", async () => {
		const refresh = deferred<string | null>();
		const defaultGetItem = mockGetItem.getMockImplementation();
		mockGetItem
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockReturnValueOnce(refresh.promise)
			.mockImplementation(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			);
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

		tombstoneList("lst_pantry");
		seedList("lst_bakery", {
			createdAtMillis: 1_700_000_003_000,
			updatedAtMillis: 1_700_000_003_000,
		});
		await act(async () => {
			arrangeQuery({ data: [summary("lst_recent")] });
			await rerender(undefined);
		});
		await act(async () => {
			refresh.resolve(JSON.stringify({ [HOUSEHOLD_ID]: "lst_pantry" }));
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		mockSetItem.mockClear();
		mockTrack.mockClear();

		await expect(
			result.current.actions.selectList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "alreadyCurrent" });
		expect(mockSetItem).not.toHaveBeenCalled();
		expect(mockTrack).not.toHaveBeenCalled();

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expectStoredSelection("lst_bakery");
		expect(activeListIds()).toEqual(["lst_bakery"]);
	});
});

describe("useListCollection createList", () => {
	it("creates and selects without emitting a switch event", async () => {
		const { result } = await renderCollection();

		await act(async () => {
			await expect(
				result.current.actions.createList({ name: "Hardware" }),
			).resolves.toMatchObject({
				status: "createdAndSelected",
			});
		});

		const created = listRowsByName("Hardware");
		expect(created).toHaveLength(1);
		expectStoredSelection(created[0]?.id ?? null);
		expect(mockTrack).toHaveBeenCalledWith("list_created", {
			household_id: HOUSEHOLD_ID,
			list_id: created[0]?.id,
			user_id: USER_ID,
		});
		expect(mockTrack).not.toHaveBeenCalledWith(
			"list_switched",
			expect.anything(),
		);
	});

	it("updates the internal Current List ref and refreshes selection after create", async () => {
		const refresh = deferred<string | null>();
		const defaultGetItem = mockGetItem.getMockImplementation();
		mockGetItem
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockImplementationOnce(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			)
			.mockReturnValueOnce(refresh.promise)
			.mockImplementation(
				(key) => defaultGetItem?.(key) ?? Promise.resolve(null),
			);
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({ status: "active" }),
		);

		let createdListId = "";
		await act(async () => {
			const outcome = await result.current.actions.createList({
				name: "Hardware",
			});
			if (outcome.status === "createdAndSelected") {
				createdListId = outcome.listId;
			}
		});

		await expect(
			result.current.actions.selectList({ listId: createdListId }),
		).resolves.toEqual({ status: "alreadyCurrent" });
	});

	it("keeps the created List when persisting the selection fails", async () => {
		mockSetItem.mockRejectedValueOnce(new Error("storage offline"));
		const { result } = await renderCollection();

		await act(async () => {
			await expect(
				result.current.actions.createList({ name: "Hardware" }),
			).resolves.toMatchObject({
				status: "createdSelectionFailed",
			});
		});

		const created = listRowsByName("Hardware");
		expect(created).toHaveLength(1);
		expectStoredSelection(null);
		expect(mockTrack).toHaveBeenCalledWith("list_created", {
			household_id: HOUSEHOLD_ID,
			list_id: created[0]?.id,
			user_id: USER_ID,
		});
	});

	it("maps Create and Rename service outcomes through semantic mappings", async () => {
		const { result } = await renderCollection();

		await expect(
			result.current.actions.createList({ name: "" }),
		).resolves.toEqual({ status: "invalidName", reason: "required" });

		jest
			.spyOn(mockProductDatabase(), "writeTransaction")
			.mockRejectedValueOnce(new Error("offline"));
		await expect(
			result.current.actions.createList({ name: "Hardware" }),
		).resolves.toEqual({ status: "failed" });

		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "lst_pantry",
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
		expect(listRowsByName("Pantry Staples")).toHaveLength(1);
		expect(mockTrack).toHaveBeenCalledWith("list_renamed", {
			household_id: HOUSEHOLD_ID,
			list_id: "lst_pantry",
			user_id: USER_ID,
		});
	});

	it("maps an invalid rename name to its validation reason", async () => {
		const { result } = await renderCollection();

		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "x".repeat(200),
			}),
		).resolves.toEqual({ status: "invalidName", reason: "tooLong" });
	});

	it("maps missing and deleted renames to gone", async () => {
		const { result } = await renderCollection();

		await expect(
			result.current.actions.renameList({
				listId: "lst_missing",
				name: "Pantry",
			}),
		).resolves.toEqual({ status: "gone" });

		tombstoneList("lst_pantry");
		await expect(
			result.current.actions.renameList({
				listId: "lst_pantry",
				name: "Pantry",
			}),
		).resolves.toEqual({ status: "gone" });
	});

	it("maps a rename service throw to failed", async () => {
		jest
			.spyOn(mockProductDatabase(), "getOptional")
			.mockRejectedValueOnce(new Error("offline"));
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
		setStoredSelection("lst_recent");
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expect(activeListIds()).toEqual(["lst_pantry"]);
		expectStoredSelection("lst_pantry");
		expect(mockTrack).toHaveBeenCalledWith("list_deleted", {
			household_id: HOUSEHOLD_ID,
			list_id: "lst_recent",
			user_id: USER_ID,
		});
	});

	it("persists the fallback when summaries rerender before Current List deletion resolves", async () => {
		setStoredSelection("lst_recent");
		const { result, rerender } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		const tombstoneCommitted = deferred<void>();
		const releaseDelete = deferred<void>();
		const writeTransaction = mockProductDatabase().writeTransaction;
		jest
			.spyOn(mockProductDatabase(), "writeTransaction")
			.mockImplementationOnce(async (run) => {
				const outcome = await writeTransaction(run);
				tombstoneCommitted.resolve();
				await releaseDelete.promise;
				return outcome;
			});

		const deletion = result.current.actions.deleteList({
			listId: "lst_recent",
		});
		await tombstoneCommitted.promise;
		expect(activeListIds()).toEqual(["lst_pantry"]);

		await act(async () => {
			arrangeQuery({ data: [summary("lst_pantry")] });
			await rerender(undefined);
		});
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_pantry",
			}),
		);

		await act(async () => {
			releaseDelete.resolve();
			await expect(deletion).resolves.toEqual({ status: "deleted" });
		});

		expectStoredSelection("lst_pantry");
	});

	it("does not repair non-current deletion and clears an only Current List", async () => {
		setStoredSelection("lst_recent");
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_pantry" }),
			).resolves.toEqual({ status: "deleted" });
		});
		expectStoredSelection("lst_recent");

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});
		expect(activeListIds()).toEqual([]);
		expectStoredSelection(null);
	});

	it("keeps deletion best-effort and refreshes after repair failures", async () => {
		setStoredSelection("lst_recent");
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));
		jest
			.spyOn(mockProductDatabase(), "getAll")
			.mockRejectedValueOnce(new Error("read failed"));

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expectStoredSelection("lst_recent");
		await waitFor(() => expect(mockGetItem).toHaveBeenCalled());

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});
	});

	it("refreshes without rewriting storage when the Current List deletion did not write", async () => {
		tombstoneList("lst_recent");
		setStoredSelection("lst_recent");
		const { result } = await renderCollection();
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				currentListId: "lst_recent",
			}),
		);
		mockSetItem.mockClear();
		mockRemoveItem.mockClear();

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expect(mockSetItem).not.toHaveBeenCalled();
		expect(mockRemoveItem).not.toHaveBeenCalled();
	});

	it("keeps a failed fallback write best-effort and still refreshes", async () => {
		setStoredSelection("lst_recent");
		mockSetItem.mockRejectedValueOnce(new Error("write failed"));
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expectStoredSelection("lst_recent");
		expect(activeListIds()).toEqual(["lst_pantry"]);
	});

	it("keeps a failed selection clear best-effort and still refreshes", async () => {
		setStoredSelection("lst_recent");
		tombstoneList("lst_pantry");
		mockRemoveItem.mockRejectedValueOnce(new Error("clear failed"));
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));

		await act(async () => {
			await expect(
				result.current.actions.deleteList({ listId: "lst_recent" }),
			).resolves.toEqual({ status: "deleted" });
		});

		expectStoredSelection("lst_recent");
		expect(activeListIds()).toEqual([]);
	});

	it("maps missing and native delete failures", async () => {
		const { result } = await renderCollection();

		await expect(
			result.current.actions.deleteList({ listId: "lst_missing" }),
		).resolves.toEqual({ status: "gone" });

		jest
			.spyOn(mockProductDatabase(), "getOptional")
			.mockRejectedValueOnce(new Error("offline"));
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "failed" });
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

function mockAsyncStorageWithMap() {
	mockGetItem.mockImplementation((key) =>
		Promise.resolve(storage.get(key) ?? null),
	);
	mockSetItem.mockImplementation((key, value) => {
		storage.set(key, value);
		return Promise.resolve();
	});
	mockRemoveItem.mockImplementation((key) => {
		storage.delete(key);
		return Promise.resolve();
	});
}

function seedDefaultLists() {
	seedList("lst_recent", {
		createdAtMillis: 1_700_000_000_000,
		updatedAtMillis: 1_700_000_002_000,
	});
	seedList("lst_pantry", {
		createdAtMillis: 1_700_000_001_000,
		updatedAtMillis: 1_700_000_001_000,
	});
}

function seedList(
	id: string,
	input: { createdAtMillis: number; updatedAtMillis: number },
) {
	mockProductDatabase().seedList({
		id,
		householdId: HOUSEHOLD_ID,
		name: id,
		createdByUserId: USER_ID,
		createdAtMillis: input.createdAtMillis,
		updatedAtMillis: input.updatedAtMillis,
	});
}

function setStoredSelection(listId: string) {
	storage.set(STORAGE_KEY, JSON.stringify({ [HOUSEHOLD_ID]: listId }));
}

function expectStoredSelection(listId: string | null) {
	const raw = storage.get(STORAGE_KEY);
	if (listId === null) {
		expect(raw).toBeUndefined();
		return;
	}
	expect(raw).toBeDefined();
	expect(JSON.parse(raw ?? "{}")).toEqual({ [HOUSEHOLD_ID]: listId });
}

function expectProductQueryCompiledForActiveRecentLists() {
	const query = mockUseProductQuery.mock.calls[0]?.[0];
	expect(query).toBeDefined();
	const compiled = (query as ProductQuery<ListSummary>).compile();
	expect(compiled.parameters).toEqual([HOUSEHOLD_ID]);
	expect(compiled.sql).toContain("l.household_id = ?");
	expect(compiled.sql).toContain("AND l.deleted_at IS NULL");
	expect(compiled.sql).toContain("AND l.archived_at IS NULL");
	expect(compiled.sql).toContain(
		"ORDER BY last_activity_at DESC, l.created_at ASC, l.id ASC",
	);
}

function listRowsByName(name: string): { id: string }[] {
	return mockProductDatabase()
		.raw.prepare("SELECT id FROM lists WHERE name = ? ORDER BY id")
		.all(name) as { id: string }[];
}

function activeListIds(): string[] {
	return mockProductDatabase()
		.raw.prepare(
			"SELECT id FROM lists WHERE deleted_at IS NULL ORDER BY updated_at DESC, created_at ASC, id ASC",
		)
		.all()
		.map((row) => (row as { id: string }).id);
}

function tombstoneList(listId: string) {
	mockProductDatabase()
		.raw.prepare("UPDATE lists SET deleted_at = ?, updated_at = ? WHERE id = ?")
		.run("2030-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z", listId);
}

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: USER_ID,
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: HOUSEHOLD_ID, name: "Home" },
		households: [],
		activeMember: {
			id: "mbr_avery",
			userId: USER_ID,
			role: "owner",
			displayName: "Avery",
		},
		members: [],
	};
}

function summary(id: string): ListSummary {
	return {
		id,
		householdId: HOUSEHOLD_ID,
		name: id,
		createdByUserId: USER_ID,
		createdAt: id === "lst_pantry" ? 1_700_000_001_000 : 1_700_000_000_000,
		updatedAt: id === "lst_pantry" ? 1_700_000_001_000 : 1_700_000_002_000,
		archived: false,
		archivedAt: null,
		lastActivityAt: id === "lst_pantry" ? 1_700_000_001_000 : 1_700_000_002_000,
		uncheckedItemCount: 0,
		checkedItemCount: 0,
	};
}

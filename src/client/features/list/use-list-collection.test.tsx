import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
	clearCurrentListSelection,
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
	setCurrentListSelection,
} from "@/client/features/list/current-selection";
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
	useProductQuery,
	withProductQueryRetryKey,
} from "@/client/lib/use-product-query";
import type { AuthenticatedAppSession } from "@/client/session";
import { deferred } from "@/test/async";
import { useListCollection } from "./use-list-collection";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

jest.mock("@/client/lib/use-product-query", () => ({
	useProductQuery: jest.fn(),
	withProductQueryRetryKey: jest.fn(
		<Row,>(query: ProductQuery<Row>, retryEpoch: number) => {
			if (retryEpoch === 0) return query;
			return {
				execute: () => query.execute(),
				compile: () => {
					const compiled = query.compile();
					return {
						...compiled,
						sql: `${compiled.sql}\\n-- retry ${retryEpoch}`,
					};
				},
			};
		},
	),
}));
jest.mock("./use-product-services", () => ({
	useProductServices: jest.fn(),
}));
jest.mock("@/client/features/list/current-selection", () => ({
	clearCurrentListSelection: jest.fn(),
	clearCurrentListSelectionIfMatches: jest.fn(),
	getCurrentListSelection: jest.fn(),
	setCurrentListSelection: jest.fn(),
}));
jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);
jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

const mockUseProductQuery = jest.mocked(useProductQuery);
const mockRetryKey = jest.mocked(withProductQueryRetryKey);
const mockUseProductServices = jest.mocked(useProductServices);
const mockGetSelection = jest.mocked(getCurrentListSelection);
const mockSetSelection = jest.mocked(setCurrentListSelection);
const mockClearSelection = jest.mocked(clearCurrentListSelection);
const mockClearIfMatches = jest.mocked(clearCurrentListSelectionIfMatches);
const mockTrack = jest.mocked(track);
const mockLogger = jest.mocked(logger);
const listListsQuery = {
	compile: () => ({ sql: "SELECT lists", parameters: [] }),
	execute: async () => [],
};
const summaries = [summary("lst_recent"), summary("lst_pantry")];
let services: ProductServices;
let listLists: jest.Mock;
let createList: jest.Mock;
let renameList: jest.Mock;
let deleteList: jest.Mock;

beforeEach(() => {
	mockGetSelection.mockResolvedValue(null);
	mockSetSelection.mockResolvedValue(undefined);
	mockClearSelection.mockResolvedValue(undefined);
	mockClearIfMatches.mockResolvedValue(false);
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
	mockUseProductQuery.mockReturnValue(queryResult({ data: summaries }));
});

afterEach(() => {
	jest.clearAllMocks();
});

describe("useListCollection", () => {
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

	it("maps query loading, error, and zero-active states", async () => {
		const { result, rerender } = await renderCollection();
		mockUseProductQuery.mockReturnValue(
			queryResult({ data: [], isLoading: true }),
		);
		await rerender(undefined);
		expect(result.current.state).toEqual({ status: "loading" });
		mockUseProductQuery.mockReturnValue(
			queryResult({ data: [], error: new Error("offline") }),
		);
		await rerender(undefined);
		expect(result.current.state).toEqual({
			status: "error",
			message: "Unable to load your Lists. Please try again.",
		});
		mockUseProductQuery.mockReturnValue(queryResult({ data: [] }));
		await rerender(undefined);
		expect(result.current.state).toEqual({ status: "zeroActive" });
	});

	it("rekeys and recovers a failed summaries query without rereading selection", async () => {
		mockUseProductQuery.mockReturnValue(
			queryResult({ data: [], error: new Error("offline") }),
		);
		const { result, rerender } = await renderCollection();
		await act(async () => result.current.actions.retry());
		mockUseProductQuery.mockReturnValue(queryResult({ data: summaries }));
		await rerender(undefined);
		expect(mockRetryKey).toHaveBeenCalledWith(listListsQuery, 1);
		expect(result.current.state.status).toBe("active");
		expect(mockGetSelection).toHaveBeenCalledTimes(1);
	});

	it("persists selection before tracking and refreshes after success", async () => {
		const write = deferred<void>();
		mockSetSelection.mockReturnValue(write.promise);
		const { result } = await renderCollection();
		const outcome = result.current.actions.selectList({ listId: "lst_pantry" });
		expect(mockSetSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_1",
			"lst_pantry",
		);
		expect(mockTrack).not.toHaveBeenCalled();
		write.resolve();
		await expect(outcome).resolves.toEqual({ status: "selected" });
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_1",
			list_id: "lst_pantry",
			user_id: "usr_avery",
		});
	});

	it("returns semantic selection failures and blocks concurrent writes", async () => {
		const write = deferred<void>();
		mockSetSelection.mockReturnValue(write.promise);
		const { result } = await renderCollection();
		const first = result.current.actions.selectList({ listId: "lst_pantry" });
		await expect(
			result.current.actions.selectList({ listId: "lst_created" }),
		).resolves.toEqual({
			status: "notSelected",
			reason: "busy",
			currentListId: "lst_recent",
		});
		write.resolve();
		await expect(first).resolves.toEqual({ status: "selected" });
		mockSetSelection.mockRejectedValueOnce(new Error("offline"));
		await expect(
			result.current.actions.selectList({ listId: "lst_recent" }),
		).resolves.toEqual({
			status: "notSelected",
			reason: "selectionFailed",
			currentListId: "lst_pantry",
		});
	});

	it("creates and selects without emitting a switch event", async () => {
		const { result } = await renderCollection();
		await expect(
			result.current.actions.createList({ name: "Hardware" }),
		).resolves.toEqual({
			status: "createdAndSelected",
			listId: "lst_created",
		});
		expect(mockSetSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_1",
			"lst_created",
		);
		expect(mockTrack).not.toHaveBeenCalled();
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

	it("repairs a deleted Current List to the first remaining List", async () => {
		mockGetSelection.mockResolvedValue("lst_recent");
		const { result } = await renderCollection();
		await waitFor(() => expect(result.current.state.status).toBe("active"));
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "deleted" });
		expect(listLists).toHaveBeenCalledWith({
			archive: "active",
			sort: "recentActivity",
		});
		expect(mockSetSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_1",
			"lst_recent",
		);
	});

	it("does not repair non-current deletion and clears an only Current List", async () => {
		const { result } = await renderCollection();
		await expect(
			result.current.actions.deleteList({ listId: "lst_pantry" }),
		).resolves.toEqual({ status: "deleted" });
		expect(listLists).not.toHaveBeenCalled();
		listLists.mockResolvedValueOnce([]);
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "deleted" });
		expect(mockClearSelection).toHaveBeenCalledWith("usr_avery", "hh_1");
	});

	it("keeps deletion best-effort and refreshes after repair failures", async () => {
		listLists.mockRejectedValueOnce(new Error("read failed"));
		const { result } = await renderCollection();
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "deleted" });
		expect(mockGetSelection).toHaveBeenCalledTimes(1);
		deleteList.mockResolvedValueOnce({
			status: "missing",
			listId: "lst_recent",
			didWrite: false,
		});
		await expect(
			result.current.actions.deleteList({ listId: "lst_recent" }),
		).resolves.toEqual({ status: "gone" });
	});
});

function renderCollection() {
	return renderHook(() => useListCollection(sessionFixture()));
}

function queryResult(input: {
	data: ListSummary[];
	isLoading?: boolean;
	isFetching?: boolean;
	error?: Error;
}) {
	return {
		data: input.data,
		isLoading: input.isLoading ?? false,
		isFetching: input.isFetching ?? false,
		error: input.error,
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
			listItemsQuery: jest.fn(() => listListsQuery),
			addItem: jest.fn(),
			setItemChecked: jest.fn(),
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

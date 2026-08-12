import type { Item, ItemService } from "@mobile/features/item/item-service";
import { useItemService } from "@mobile/features/item/use-item-service";
import { useQuery } from "@powersync/react";
import { act, renderHook } from "@testing-library/react-native";
import {
	authenticatedAppSession,
	groceriesListSummary,
} from "./list-test-support";
import { useListPage } from "./use-list-page";

jest.mock("@powersync/react", () => ({ useQuery: jest.fn() }));
jest.mock("@mobile/features/item/use-item-service", () => ({
	useItemService: jest.fn(),
}));

const mockUseQuery = jest.mocked(useQuery);
const mockUseItemService = jest.mocked(useItemService);

describe("useListPage", () => {
	let addItem: jest.Mock;
	let updateItem: jest.Mock;
	let deleteItem: jest.Mock;
	let setItemChecked: jest.Mock;

	beforeEach(() => {
		addItem = jest.fn(async () => undefined);
		updateItem = jest.fn(async () => undefined);
		deleteItem = jest.fn(async () => undefined);
		setItemChecked = jest.fn(async () => undefined);
		mockUseItemService.mockReturnValue(
			itemService({ addItem, updateItem, deleteItem, setItemChecked }),
		);
		mockUseQuery.mockReturnValue(queryResult({ data: [] }));
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("maps the explicit List query to an active page and filters stale rows", async () => {
		mockUseQuery.mockReturnValue(
			queryResult({
				data: [
					item("itm_milk", "lst_groceries"),
					item("itm_stale", "lst_pantry"),
				],
			}),
		);

		const { result } = await renderHook(() =>
			useListPage(authenticatedAppSession, groceriesListSummary),
		);

		expect(result.current).toMatchObject({
			status: "active",
			listId: "lst_groceries",
			list: {
				listName: "Groceries",
				items: [{ id: "itm_milk", name: "Milk" }],
			},
		});
	});

	it("preserves existing Item creation and checked-state service semantics", async () => {
		const { result } = await renderHook(() =>
			useListPage(authenticatedAppSession, groceriesListSummary),
		);
		const page = result.current;
		if (page.status !== "active") {
			throw new Error("Expected an active List page");
		}

		await act(async () => {
			await page.actions.addItem({
				listId: "lst_groceries",
				name: "Milk",
				quantity: null,
				notes: null,
			});
			await page.actions.updateItem({
				itemId: "itm_milk",
				sourceListId: "lst_groceries",
				destinationListId: "lst_pantry",
				name: "Oat milk",
				quantity: "2",
				notes: "Unsweetened",
			});
			await page.actions.deleteItem({
				itemId: "itm_milk",
				listId: "lst_groceries",
			});
			await page.actions.setItemChecked("itm_milk", true);
		});

		expect(addItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			userId: "usr_avery",
			name: "Milk",
			quantity: null,
			notes: null,
		});
		expect(updateItem).toHaveBeenCalledWith({
			itemId: "itm_milk",
			userId: "usr_avery",
			sourceListId: "lst_groceries",
			destinationListId: "lst_pantry",
			name: "Oat milk",
			quantity: "2",
			notes: "Unsweetened",
		});
		expect(deleteItem).toHaveBeenCalledWith({
			itemId: "itm_milk",
			listId: "lst_groceries",
			userId: "usr_avery",
		});
		expect(setItemChecked).toHaveBeenCalledWith({
			listId: "lst_groceries",
			itemId: "itm_milk",
			userId: "usr_avery",
			checked: true,
		});
	});

	it("maps the watched-query loading state", async () => {
		mockUseQuery.mockReturnValue(
			queryResult({ data: [], isLoading: true, isFetching: true }),
		);
		const loading = await renderHook(() =>
			useListPage(authenticatedAppSession, groceriesListSummary),
		);
		expect(loading.result.current).toEqual({ status: "loading" });
	});

	it("maps a watched-query error", async () => {
		mockUseQuery.mockReturnValue(
			queryResult({ data: [], error: new Error("db unavailable") }),
		);
		const failed = await renderHook(() =>
			useListPage(authenticatedAppSession, groceriesListSummary),
		);
		expect(failed.result.current).toMatchObject({
			status: "error",
			message: "Unable to load this List. Please try again.",
		});
	});

	it("re-runs a failed Items query when the page retries", async () => {
		mockUseQuery.mockReturnValue(
			queryResult({ data: [], error: new Error("db unavailable") }),
		);
		const { result } = await renderHook(() =>
			useListPage(authenticatedAppSession, groceriesListSummary),
		);
		const failed = result.current;
		if (failed.status !== "error") {
			throw new Error("Expected a failed List page");
		}
		// The page hands its error state the watched query's own retry, which
		// re-keys the query the SDK sees; a retry that hands back the same
		// compiled key would leave the page stuck on its error.
		const failedKey = watchedQueryKey();

		mockUseQuery.mockReturnValue(
			queryResult({ data: [item("itm_milk", "lst_groceries")] }),
		);
		await act(async () => {
			failed.retry();
		});

		expect(watchedQueryKey()).not.toEqual(failedKey);
		expect(result.current).toMatchObject({
			status: "active",
			listId: "lst_groceries",
			list: { items: [{ id: "itm_milk" }] },
		});
	});
});

/** Compiled SQL and parameters the SDK re-keys the watched query on. */
function watchedQueryKey() {
	const lastCall = mockUseQuery.mock.calls.at(-1);
	const query = lastCall?.[0];
	if (typeof query !== "object" || query === null) {
		throw new Error("Expected a compilable watched query");
	}
	return query.compile();
}

function queryResult(input: {
	data: Item[];
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

function itemService({
	addItem,
	updateItem,
	deleteItem,
	setItemChecked,
}: {
	addItem: jest.Mock;
	updateItem: jest.Mock;
	deleteItem: jest.Mock;
	setItemChecked: jest.Mock;
}): ItemService {
	const unused = jest.fn(async () => {
		throw new Error("unexpected service call");
	});
	return {
		listItems: unused,
		listItemsQuery: jest.fn(() => ({
			compile: () => ({ sql: "SELECT items", parameters: [] }),
			execute: async () => [],
		})),
		addItem,
		updateItem,
		deleteItem,
		setItemChecked,
	};
}

function item(id: string, listId: string): Item {
	return {
		id,
		householdId: "hh_avery",
		listId,
		name: id === "itm_milk" ? "Milk" : "Stale",
		quantity: null,
		notes: null,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
		checked: false,
		checkedByUserId: null,
		position: 0,
	};
}

import { useQuery } from "@powersync/react";
import { act, renderHook } from "@testing-library/react-native";
import type { Item } from "./item-service";
import {
	authenticatedAppSession,
	groceriesListSummary,
} from "./list-test-support";
import { useListPage } from "./use-list-page";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

jest.mock("@powersync/react", () => ({ useQuery: jest.fn() }));
jest.mock("./use-product-services", () => ({ useProductServices: jest.fn() }));

const mockUseQuery = jest.mocked(useQuery);
const mockUseProductServices = jest.mocked(useProductServices);

describe("useListPage", () => {
	let addItem: jest.Mock;
	let setItemChecked: jest.Mock;

	beforeEach(() => {
		addItem = jest.fn(async () => undefined);
		setItemChecked = jest.fn(async () => undefined);
		mockUseProductServices.mockReturnValue(
			productServices({ addItem, setItemChecked }),
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
			await page.actions.setItemChecked("itm_milk", true);
		});

		expect(addItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			userId: "usr_avery",
			name: "Milk",
			quantity: null,
			notes: null,
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
		expect(failed.result.current).toEqual({
			status: "error",
			message: "Unable to load this List. Please try again.",
		});
	});
});

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

function productServices({
	addItem,
	setItemChecked,
}: {
	addItem: jest.Mock;
	setItemChecked: jest.Mock;
}): ProductServices {
	const unused = jest.fn(async () => {
		throw new Error("unexpected service call");
	});
	return {
		lists: {
			listLists: unused,
			listListsQuery: jest.fn(() => ({
				compile: () => ({ sql: "SELECT lists", parameters: [] }),
				execute: async () => [],
			})),
			createList: unused,
			renameList: unused,
			deleteList: unused,
		},
		items: {
			listItems: unused,
			listItemsQuery: jest.fn(() => ({
				compile: () => ({ sql: "SELECT items", parameters: [] }),
				execute: async () => [],
			})),
			addItem,
			setItemChecked,
		},
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

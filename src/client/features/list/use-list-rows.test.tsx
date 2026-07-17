import { useQuery } from "@powersync/react";
import { renderHook } from "@testing-library/react-native";
import type { ListSummary } from "@/client/features/list/list-service";
import type { AuthenticatedAppSession } from "@/client/session";
import { useListRows } from "./use-list-rows";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

jest.mock("@powersync/react", () => ({ useQuery: jest.fn() }));
jest.mock("./use-product-services", () => ({ useProductServices: jest.fn() }));

const mockUseQuery = jest.mocked(useQuery);
const mockUseProductServices = jest.mocked(useProductServices);

describe("useListRows", () => {
	const summaries = [summary("lst_recent"), summary("lst_pantry")];
	const listListsQuery = {
		compile: () => ({ sql: "SELECT lists", parameters: [] }),
		execute: async () => summaries,
	};
	let listListsQueryMock: jest.Mock;

	beforeEach(() => {
		listListsQueryMock = jest.fn(() => listListsQuery);
		mockUseProductServices.mockReturnValue(productServices(listListsQueryMock));
		mockUseQuery.mockReturnValue(queryResult({ data: [] }));
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("returns loading while the watched query is loading", async () => {
		mockUseQuery.mockReturnValue(
			queryResult({ data: [], isLoading: true, isFetching: true }),
		);

		const { result } = await renderUseListRows();

		expect(result.current.rows).toEqual({ status: "loading" });
	});

	it("maps watched query data to ready summaries", async () => {
		mockUseQuery.mockReturnValue(queryResult({ data: summaries }));

		const { result } = await renderUseListRows();

		expect(result.current.rows).toEqual({ status: "ready", summaries });
	});

	it("maps a watched query error to the error state", async () => {
		mockUseQuery.mockReturnValue(
			queryResult({ data: summaries, error: new Error("db unavailable") }),
		);

		const { result } = await renderUseListRows();

		expect(result.current.rows).toEqual({ status: "error" });
	});

	it("builds the active recent-activity summaries query and passes it to useQuery", async () => {
		await renderUseListRows();

		expect(listListsQueryMock).toHaveBeenCalledWith({
			archive: "active",
			sort: "recentActivity",
		});
		expect(mockUseQuery).toHaveBeenCalledWith(listListsQuery);
	});
});

function renderUseListRows() {
	return renderHook(() => useListRows(sessionFixture()));
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

function productServices(listListsQueryMock: jest.Mock): ProductServices {
	const unused = jest.fn(async () => {
		throw new Error("unexpected service call");
	});
	return {
		lists: {
			listLists: unused,
			listListsQuery: listListsQueryMock,
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

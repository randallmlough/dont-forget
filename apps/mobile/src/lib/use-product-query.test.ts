import type { ProductQuery } from "@mobile/lib/product-database";
import { useProductQuery } from "@mobile/lib/use-product-query";
import { useQuery } from "@powersync/react";
import { act, renderHook } from "@testing-library/react-native";

jest.mock("@powersync/react", () => ({ useQuery: jest.fn() }));

const mockUseQuery = jest.mocked(useQuery);

type ItemRow = { id: string };

describe("useProductQuery", () => {
	let execute: jest.Mock<Promise<ItemRow[]>, []>;

	beforeEach(() => {
		execute = jest.fn(async () => [{ id: "itm_milk" }]);
		mockUseQuery.mockReturnValue({
			data: [],
			isLoading: false,
			isFetching: false,
			error: undefined,
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("watches the service query itself until a retry re-keys it", async () => {
		const query = itemsQuery(execute);

		await renderHook(() => useProductQuery<ItemRow>(query));

		expect(watchedQuery()).toBe(query);
	});

	it("re-keys the compiled SQL on retry and still delegates execution", async () => {
		const query = itemsQuery(execute);
		const { result } = await renderHook(() => useProductQuery<ItemRow>(query));

		await act(async () => {
			result.current.retry();
		});

		// The SDK re-runs a watched query only when its compiled SQL or parameters
		// change, so an unchanged key would leave a failed surface stuck.
		expect(watchedQuery()).not.toBe(query);
		expect(watchedQuery().compile()).toEqual({
			sql: "SELECT items WHERE list_id = ?\n-- retry 1",
			parameters: ["lst_groceries"],
		});
		await expect(watchedQuery().execute()).resolves.toEqual([
			{ id: "itm_milk" },
		]);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("keeps retry stable across renders and retries", async () => {
		const { result, rerender } = await renderHook(() =>
			useProductQuery<ItemRow>(itemsQuery(execute)),
		);
		const retry = result.current.retry;

		await rerender(undefined);
		expect(result.current.retry).toBe(retry);

		await act(async () => {
			result.current.retry();
		});
		expect(result.current.retry).toBe(retry);
	});
});

/** The query the hook last handed to the SDK's watched-query hook. */
function watchedQuery() {
	const query = mockUseQuery.mock.calls.at(-1)?.[0];
	if (typeof query !== "object" || query === null) {
		throw new Error("Expected a compilable watched query");
	}
	return query;
}

function itemsQuery(
	execute: jest.Mock<Promise<ItemRow[]>, []>,
): ProductQuery<ItemRow> {
	return {
		compile: () => ({
			sql: "SELECT items WHERE list_id = ?",
			parameters: ["lst_groceries"],
		}),
		execute,
	};
}

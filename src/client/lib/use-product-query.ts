import type { useQuery as usePowerSyncWatchedQuery } from "@powersync/react";
import type { ProductQuery } from "@/client/lib/product-database";

export type ProductQueryResult<T> = {
	data: T[];
	isLoading: boolean;
	isFetching: boolean;
	error: Error | undefined;
};

export function useProductQuery<RowType>(
	query: ProductQuery<RowType>,
): ProductQueryResult<RowType> {
	// @powersync/react is ESM-only; loading it inside the hook keeps Jest tests
	// that do not render this hook from requiring the package at module import.
	const powersyncReact = require("@powersync/react") as {
		useQuery: typeof usePowerSyncWatchedQuery;
	};
	const useQuery: <T>(query: ProductQuery<T>) => ProductQueryResult<T> =
		powersyncReact.useQuery;
	return useQuery(query);
}

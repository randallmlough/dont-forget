import type { useQuery as usePowerSyncWatchedQuery } from "@powersync/react";
import { useCallback, useState } from "react";
import type { ProductQuery } from "@/client/lib/product-database";

type WatchedQueryResult<RowType> = {
	data: RowType[];
	isLoading: boolean;
	isFetching: boolean;
	error: Error | undefined;
};

export type ProductQueryResult<RowType> = WatchedQueryResult<RowType> & {
	retry: () => void;
};

export function useProductQuery<RowType>(
	query: ProductQuery<RowType>,
): ProductQueryResult<RowType> {
	const [retryEpoch, setRetryEpoch] = useState(0);
	const retry = useCallback(() => {
		setRetryEpoch((epoch) => epoch + 1);
	}, []);
	// @powersync/react is ESM-only; loading it inside the hook keeps Jest tests
	// that do not render this hook from requiring the package at module import.
	const powersyncReact = require("@powersync/react") as {
		useQuery: typeof usePowerSyncWatchedQuery;
	};
	const useQuery: <T>(query: ProductQuery<T>) => WatchedQueryResult<T> =
		powersyncReact.useQuery;
	return { ...useQuery(withRetryKey(query, retryEpoch)), retry };
}

/**
 * A watched PowerSync query re-runs when its compiled SQL or parameters change,
 * and the SDK offers no refresh of its own for one (`refresh` comes back only
 * from `runQueryOnce` queries). A surface whose query failed therefore has
 * nothing left to re-trigger it — navigating away and back re-renders the same
 * query key. `retry` re-keys it with a trailing SQL comment: SQLite ignores the
 * comment, `execute()` still runs the service's own read path, and the SDK sees
 * a query it has not run yet.
 */
function withRetryKey<RowType>(
	query: ProductQuery<RowType>,
	retryEpoch: number,
): ProductQuery<RowType> {
	if (retryEpoch === 0) return query;
	return {
		execute: () => query.execute(),
		compile: () => {
			const compiled = query.compile();
			return { ...compiled, sql: `${compiled.sql}\n-- retry ${retryEpoch}` };
		},
	};
}

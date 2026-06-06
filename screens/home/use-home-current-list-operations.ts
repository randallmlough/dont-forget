import { useCallback, useMemo, useRef } from "react";

type HomeCurrentListOperation =
	| "archive"
	| "create"
	| "delete"
	| "rename"
	| "switch"
	| "unarchive";

type OperationState = Record<HomeCurrentListOperation, boolean>;
type OperationRequestIds = Record<HomeCurrentListOperation, number>;

const operations: HomeCurrentListOperation[] = [
	"archive",
	"create",
	"delete",
	"rename",
	"switch",
	"unarchive",
];

export type HomeCurrentListOperations = ReturnType<
	typeof useHomeCurrentListOperations
>;

export function useHomeCurrentListOperations() {
	const mounted = useRef(false);
	const busy = useRef<OperationState>(initialOperationState(false));
	const requestIds = useRef<OperationRequestIds>(initialOperationState(0));

	const begin = useCallback((operation: HomeCurrentListOperation) => {
		if (!mounted.current || busy.current[operation]) return null;
		busy.current[operation] = true;
		requestIds.current[operation] += 1;
		return requestIds.current[operation];
	}, []);

	const cancelAll = useCallback(() => {
		mounted.current = false;
		for (const operation of operations) {
			busy.current[operation] = false;
			requestIds.current[operation] += 1;
		}
	}, []);

	const finish = useCallback(
		(operation: HomeCurrentListOperation, requestId: number) => {
			if (!mounted.current || requestIds.current[operation] !== requestId) {
				return false;
			}
			busy.current[operation] = false;
			return true;
		},
		[],
	);

	const isActive = useCallback(
		(operation: HomeCurrentListOperation, requestId: number) =>
			mounted.current && requestIds.current[operation] === requestId,
		[],
	);

	const markMounted = useCallback(() => {
		mounted.current = true;
	}, []);

	return useMemo(
		() => ({
			begin,
			cancelAll,
			finish,
			isActive,
			markMounted,
			mounted,
		}),
		[begin, cancelAll, finish, isActive, markMounted],
	);
}

function initialOperationState<T>(
	value: T,
): Record<HomeCurrentListOperation, T> {
	return {
		archive: value,
		create: value,
		delete: value,
		rename: value,
		switch: value,
		unarchive: value,
	};
}

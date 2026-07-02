import { useCallback, useEffect, useRef, useState } from "react";
import { useLogger } from "@/client/lib/logger";
import { asError } from "@/shared/errors";
import { appProductDatabase } from "./powersync-app-database";

export type WatchedResourceState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

type WatchedResourceSnapshot<T> = {
	key: string;
	state: WatchedResourceState<T>;
};

export function useWatchedResource<T>(options: {
	/** Identity key; changing it resets to loading and reloads. */
	key: string;
	load: () => Promise<T>;
	errorMessage: string;
	/** Re-run load when a product table changes (default true). */
	watch?: boolean;
}): {
	state: WatchedResourceState<T>;
	refetch: () => void;
	reload: () => void;
} {
	const key = options.key;
	const logger = useLogger();
	const loadRef = useRef(options.load);
	const errorMessageRef = useRef(options.errorMessage);
	const loggerRef = useRef(logger);
	const mountedRef = useRef(false);
	const attemptRef = useRef(0);
	const [snapshot, setSnapshot] = useState<WatchedResourceSnapshot<T>>({
		key,
		state: { status: "loading" },
	});
	const snapshotRef = useRef<WatchedResourceSnapshot<T>>(snapshot);
	const state =
		snapshot.key === key
			? snapshot.state
			: ({ status: "loading" } satisfies WatchedResourceState<T>);

	const publish = useCallback((nextSnapshot: WatchedResourceSnapshot<T>) => {
		snapshotRef.current = nextSnapshot;
		setSnapshot(nextSnapshot);
	}, []);

	const startLoad = useCallback(
		(loadKey: string) => {
			const attempt = attemptRef.current + 1;
			attemptRef.current = attempt;

			void loadRef
				.current()
				.then((data) => {
					if (!mountedRef.current || attempt !== attemptRef.current) {
						return;
					}
					publish({ key: loadKey, state: { status: "ready", data } });
				})
				.catch((error: unknown) => {
					if (!mountedRef.current || attempt !== attemptRef.current) {
						return;
					}
					if (
						snapshotRef.current.key === loadKey &&
						snapshotRef.current.state.status === "ready"
					) {
						loggerRef.current.error("watched resource background load failed", {
							error: asError(error),
						});
						return;
					}
					publish({
						key: loadKey,
						state: { status: "error", message: errorMessageRef.current },
					});
				});
		},
		[publish],
	);

	const runLoad = useCallback(
		(loadOptions: { key: string; resetToLoading: boolean }) => {
			if (loadOptions.resetToLoading) {
				publish({
					key: loadOptions.key,
					state: { status: "loading" },
				});
			}
			startLoad(loadOptions.key);
		},
		[publish, startLoad],
	);

	const refetch = useCallback(() => {
		runLoad({ key, resetToLoading: false });
	}, [key, runLoad]);

	const reload = useCallback(() => {
		runLoad({ key, resetToLoading: true });
	}, [key, runLoad]);

	useEffect(() => {
		loadRef.current = options.load;
		errorMessageRef.current = options.errorMessage;
		loggerRef.current = logger;
	});

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			attemptRef.current += 1;
		};
	}, []);

	useEffect(() => {
		startLoad(key);
	}, [key, startLoad]);

	useEffect(() => {
		if (options.watch === false) return;
		const subscription = appProductDatabase.subscribeChanges(refetch);
		return () => subscription.remove();
	}, [options.watch, refetch]);

	return { state, refetch, reload };
}

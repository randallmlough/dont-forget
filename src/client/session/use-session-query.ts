import { useCallback, useEffect, useRef, useState } from "react";
import { useLogger } from "@/client/lib/logger";
import type { AuthenticatedAppSession } from "@/client/session";
import { asError } from "@/shared/errors";

export type SessionQueryState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

export function useSessionQuery<T>(options: {
	session: AuthenticatedAppSession;
	/** Identity key; changing it resets to loading and reloads. */
	loadKey: string;
	load: () => Promise<T>;
	errorMessage: string;
}): {
	state: SessionQueryState<T>;
	refetch: () => void;
	reload: () => void;
} {
	const { session, loadKey, errorMessage } = options;
	const logger = useLogger();
	const loadRef = useRef(options.load);
	const errorMessageRef = useRef(errorMessage);
	const loggerRef = useRef(logger);
	const [state, setState] = useState<SessionQueryState<T>>({
		status: "loading",
	});
	const stateRef = useRef<SessionQueryState<T>>(state);
	const mountedRef = useRef(false);
	const mountGenerationRef = useRef(0);
	const inFlightRef = useRef(false);
	const inFlightLoadKeyRef = useRef<string | null>(null);
	const trailingReloadRef = useRef(false);
	const versionRef = useRef(0);
	const attemptRef = useRef(0);
	const activeLoadKeyRef = useRef<string | null>(null);

	const publish = useCallback((nextState: SessionQueryState<T>) => {
		stateRef.current = nextState;
		setState(nextState);
	}, []);

	const runLoad = useCallback(
		function runSessionQueryLoad(loadOptions: { resetToLoading: boolean }) {
			if (loadOptions.resetToLoading) {
				publish({ status: "loading" });
			}

			if (inFlightRef.current && !loadOptions.resetToLoading) {
				trailingReloadRef.current = true;
				return;
			}

			inFlightRef.current = true;
			inFlightLoadKeyRef.current = activeLoadKeyRef.current;
			trailingReloadRef.current = false;
			const version = versionRef.current;
			const attempt = attemptRef.current + 1;
			attemptRef.current = attempt;

			void loadRef
				.current()
				.then((data) => {
					if (
						!mountedRef.current ||
						version !== versionRef.current ||
						attempt !== attemptRef.current ||
						trailingReloadRef.current
					) {
						return;
					}
					publish({ status: "ready", data });
				})
				.catch((error: unknown) => {
					if (
						!mountedRef.current ||
						version !== versionRef.current ||
						attempt !== attemptRef.current ||
						trailingReloadRef.current
					) {
						return;
					}
					if (stateRef.current.status === "ready") {
						loggerRef.current.error("session query background load failed", {
							error: asError(error),
						});
						return;
					}
					publish({ status: "error", message: errorMessageRef.current });
				})
				.finally(() => {
					if (!mountedRef.current || attempt !== attemptRef.current) {
						return;
					}
					inFlightRef.current = false;
					inFlightLoadKeyRef.current = null;
					if (trailingReloadRef.current) {
						trailingReloadRef.current = false;
						runSessionQueryLoad({ resetToLoading: false });
					}
				});
		},
		[publish],
	);

	const refetch = useCallback(() => {
		runLoad({ resetToLoading: false });
	}, [runLoad]);

	const reload = useCallback(() => {
		runLoad({ resetToLoading: true });
	}, [runLoad]);

	useEffect(() => {
		loadRef.current = options.load;
		errorMessageRef.current = errorMessage;
		loggerRef.current = logger;
	});

	useEffect(() => {
		const generation = mountGenerationRef.current + 1;
		mountGenerationRef.current = generation;
		mountedRef.current = true;
		return () => {
			queueMicrotask(() => {
				if (mountGenerationRef.current === generation) {
					mountedRef.current = false;
				}
			});
		};
	}, []);

	useEffect(() => {
		if (activeLoadKeyRef.current === loadKey) return;
		if (inFlightRef.current && inFlightLoadKeyRef.current === loadKey) {
			activeLoadKeyRef.current = loadKey;
			return () => {
				if (activeLoadKeyRef.current === loadKey) {
					activeLoadKeyRef.current = null;
				}
			};
		}

		activeLoadKeyRef.current = loadKey;
		versionRef.current += 1;
		runLoad({ resetToLoading: true });
		return () => {
			if (activeLoadKeyRef.current === loadKey) {
				activeLoadKeyRef.current = null;
			}
		};
	}, [loadKey, runLoad]);

	useEffect(() => {
		const subscription = session.services.changes.subscribe(() => {
			runLoad({ resetToLoading: false });
		});
		return () => subscription.remove();
	}, [session.services.changes, runLoad]);

	return { state, refetch, reload };
}

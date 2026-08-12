export const SHUTDOWN_DEADLINE_MS = 10_000;

export type GracefulShutdownDeps = {
	closeServer: () => Promise<void>;
	forceCloseServer: () => void;
	endPool: () => Promise<void>;
	flushAnalytics: () => Promise<void>;
	exit: (code: number) => void;
	logError: (message: string, error?: unknown) => void;
	deadlineMs?: number;
};

export type GracefulShutdown = (exitCode?: number) => Promise<void>;

export function createGracefulShutdown(
	deps: GracefulShutdownDeps,
): GracefulShutdown {
	let inFlight: Promise<void> | undefined;

	return (exitCode = 0) => {
		if (inFlight) {
			return inFlight;
		}

		let exited = false;
		let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
		const exitOnce = (code: number) => {
			if (exited) {
				return;
			}
			exited = true;
			if (deadlineTimer !== undefined) {
				clearTimeout(deadlineTimer);
				deadlineTimer = undefined;
			}
			deps.exit(code);
		};
		const deadline = new Promise<void>((resolve) => {
			deadlineTimer = setTimeout(() => {
				deps.forceCloseServer();
				deps.logError("api shutdown deadline exceeded");
				exitOnce(1);
				resolve();
			}, deps.deadlineMs ?? SHUTDOWN_DEADLINE_MS);
		});
		const cleanup = (async () => {
			let failed = false;
			try {
				await deps.closeServer();
			} catch (error) {
				failed = true;
				deps.logError("api server shutdown failed", error);
			}
			try {
				await deps.endPool();
			} catch (error) {
				failed = true;
				deps.logError("api pool shutdown failed", error);
			}
			try {
				await deps.flushAnalytics();
			} catch (error) {
				failed = true;
				deps.logError("api analytics shutdown failed", error);
			}
			exitOnce(failed ? 1 : exitCode);
		})();

		inFlight = Promise.race([cleanup, deadline]);
		return inFlight;
	};
}

import type { SyncAppStateAdapter } from "./app-state";
import type { SyncNetworkStatusAdapter } from "./network-status";
import {
	createSyncCoordinator,
	type SyncCoordinator,
} from "./sync-coordinator";

const activeCoordinators: SyncCoordinator[] = [];

export function stopActiveCoordinators() {
	for (const coordinator of activeCoordinators) {
		coordinator.stop();
	}
	activeCoordinators.length = 0;
	jest.useRealTimers();
}

export function createCoordinator(
	overrides: Partial<Parameters<typeof createSyncCoordinator>[0]> = {},
) {
	const coordinator = createSyncCoordinator({
		syncAuthorized: true,
		sync: jest.fn(async () => ({ changed: false })),
		appState: memoryAppState("active"),
		networkStatus: memoryNetworkStatus("unknown"),
		logger: loggerFixture(),
		...overrides,
	});
	activeCoordinators.push(coordinator);
	return coordinator;
}

export function memoryAppState(initialState: string): SyncAppStateAdapter {
	return {
		getCurrentState() {
			return initialState;
		},
		subscribe() {
			return { remove() {} };
		},
	};
}

export function controllableAppState(
	initialState: string,
): SyncAppStateAdapter & {
	emit: (state: string) => void;
} {
	let currentState = initialState;
	const listeners = new Set<(state: string) => void>();

	return {
		getCurrentState() {
			return currentState;
		},
		subscribe(listener) {
			listeners.add(listener);
			return {
				remove() {
					listeners.delete(listener);
				},
			};
		},
		emit(state) {
			currentState = state;
			for (const listener of listeners) {
				listener(state);
			}
		},
	};
}

export function mutableAppState(initialState: string): SyncAppStateAdapter & {
	setState: (state: string) => void;
} {
	let currentState = initialState;

	return {
		getCurrentState() {
			return currentState;
		},
		subscribe() {
			return { remove() {} };
		},
		setState(state) {
			currentState = state;
		},
	};
}

export function memoryNetworkStatus(
	status: ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>,
): SyncNetworkStatusAdapter {
	return {
		getCurrentStatus() {
			return status;
		},
		async refreshCurrentStatus() {
			return status;
		},
		subscribe() {
			return { remove() {} };
		},
	};
}

export function refreshableNetworkStatus(
	initialStatus: ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>,
	refreshedStatus: ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>,
): SyncNetworkStatusAdapter & {
	refreshCurrentStatus: jest.Mock<
		Promise<ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>>,
		[]
	>;
} {
	let currentStatus = initialStatus;
	const refreshCurrentStatus = jest.fn(async () => {
		currentStatus = refreshedStatus;
		return currentStatus;
	});

	return {
		getCurrentStatus() {
			return currentStatus;
		},
		refreshCurrentStatus,
		subscribe() {
			return { remove() {} };
		},
	};
}

export function controllableNetworkStatus(
	initialStatus: ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>,
): SyncNetworkStatusAdapter & {
	emit: (
		status: ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>,
	) => void;
} {
	let currentStatus = initialStatus;
	const listeners = new Set<
		(status: ReturnType<SyncNetworkStatusAdapter["getCurrentStatus"]>) => void
	>();

	return {
		getCurrentStatus() {
			return currentStatus;
		},
		async refreshCurrentStatus() {
			return currentStatus;
		},
		subscribe(listener) {
			listeners.add(listener);
			return {
				remove() {
					listeners.delete(listener);
				},
			};
		},
		emit(status) {
			currentStatus = status;
			for (const listener of listeners) {
				listener(status);
			}
		},
	};
}

export function loggerFixture() {
	return {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		with: jest.fn(),
	};
}

export function deferred<T>() {
	let resolve: ((value: T) => void) | undefined;
	let reject: ((error: Error) => void) | undefined;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	if (!resolve || !reject) {
		throw new Error("Unable to create deferred promise");
	}

	return { promise, resolve, reject };
}

export async function actTicks() {
	await Promise.resolve();
	await Promise.resolve();
}

export async function actTimer(ms: number) {
	jest.advanceTimersByTime(ms);
	await actTicks();
}

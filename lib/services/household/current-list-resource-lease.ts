import type { ActiveListDataSource } from "@/components/active-list";

export type StaleCurrentListResourceError = Error & {
	code: "stale_current_list_resource";
};

export type CurrentListResourceLease = {
	dataSource: ActiveListDataSource;
	retire: () => void;
	waitForDrain: () => Promise<void>;
	close: () => Promise<void>;
	closeWhenDrained: () => Promise<void>;
};

export function createCurrentListResourceLease(
	dataSource: ActiveListDataSource,
): CurrentListResourceLease {
	let retired = false;
	let inFlight = 0;
	const drainWaiters = new Set<() => void>();

	async function run<T>(operation: () => Promise<T>): Promise<T> {
		if (retired) throw staleCurrentListResourceError();
		inFlight += 1;
		try {
			return await operation();
		} finally {
			inFlight -= 1;
			notifyDrained();
		}
	}

	function retire() {
		retired = true;
		notifyDrained();
	}

	function notifyDrained() {
		if (inFlight !== 0) return;
		for (const resolve of drainWaiters) resolve();
		drainWaiters.clear();
	}

	async function waitForDrain() {
		if (inFlight === 0) return;
		await new Promise<void>((resolve) => {
			drainWaiters.add(resolve);
		});
	}

	async function closeWhenDrained() {
		retire();
		await waitForDrain();
		await dataSource.close();
	}

	return {
		dataSource: {
			syncAuthorized: dataSource.syncAuthorized,
			load: () => run(() => dataSource.load()),
			addItem: (name) => run(() => dataSource.addItem(name)),
			setItemChecked: (itemId, checked) =>
				run(() => dataSource.setItemChecked(itemId, checked)),
			pull: () => run(() => dataSource.pull()),
			sync: (options) => run(() => dataSource.sync(options)),
			close: closeWhenDrained,
		},
		retire,
		waitForDrain,
		close: () => dataSource.close(),
		closeWhenDrained,
	};
}

export function isStaleCurrentListResourceError(
	error: unknown,
): error is StaleCurrentListResourceError {
	return (
		error instanceof Error &&
		"code" in error &&
		error.code === "stale_current_list_resource"
	);
}

export function staleCurrentListResourceError(): StaleCurrentListResourceError {
	return Object.assign(new Error("Current List resource is stale"), {
		code: "stale_current_list_resource" as const,
	});
}

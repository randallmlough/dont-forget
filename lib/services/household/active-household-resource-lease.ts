import { asError } from "@/lib/errors";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type { SyncOperation } from "@/lib/services/sync";

export type StaleActiveHouseholdResourceError = Error & {
	code: "stale_active_household_resource";
};

export type LeasedActiveHouseholdServices = {
	listService: ListService;
	itemService: ItemService;
	sync: SyncOperation;
};

export type ActiveHouseholdResourceLease = {
	services: LeasedActiveHouseholdServices;
	retireAndClose: (options: {
		close: () => Promise<void>;
		stopSync?: () => Promise<void>;
		waitForDrain?: boolean;
	}) => Promise<void>;
};

export function createActiveHouseholdResourceLease(
	services: LeasedActiveHouseholdServices,
): ActiveHouseholdResourceLease {
	let retired = false;
	let inFlight = 0;
	const drainWaiters = new Set<() => void>();

	async function run<T>(operation: () => Promise<T>): Promise<T> {
		if (retired) throw staleActiveHouseholdResourceError();
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

	async function retireAndClose(options: {
		close: () => Promise<void>;
		stopSync?: () => Promise<void>;
		waitForDrain?: boolean;
	}) {
		retire();
		let stopError: unknown = null;
		if (options.waitForDrain !== false) {
			await waitForDrain();
		}

		try {
			await options.stopSync?.();
		} catch (error) {
			stopError = error;
		}

		try {
			await options.close();
		} catch (closeError) {
			if (stopError) {
				throw Object.assign(asError(closeError), {
					syncStopError: asError(stopError),
				});
			}
			throw closeError;
		}

		if (stopError) {
			throw stopError;
		}
	}

	return {
		services: {
			listService: {
				getList: (input) => run(() => services.listService.getList(input)),
			},
			itemService: {
				listItems: (input) => run(() => services.itemService.listItems(input)),
				addItem: (input) => run(() => services.itemService.addItem(input)),
				setItemChecked: (input) =>
					run(() => services.itemService.setItemChecked(input)),
			},
			sync: (options) => run(() => services.sync(options)),
		},
		retireAndClose,
	};
}

export function isStaleActiveHouseholdResourceError(
	error: unknown,
): error is StaleActiveHouseholdResourceError {
	return (
		error instanceof Error &&
		"code" in error &&
		error.code === "stale_active_household_resource"
	);
}

export function staleActiveHouseholdResourceError(): StaleActiveHouseholdResourceError {
	return Object.assign(new Error("Active Household resource is stale"), {
		code: "stale_active_household_resource" as const,
	});
}

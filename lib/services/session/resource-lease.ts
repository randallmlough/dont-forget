import { asError } from "@/lib/errors";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type { SyncOperation } from "@/lib/services/sync";

export type StaleAuthenticatedAppSessionResourceError = Error & {
	code: "stale_authenticated_app_session_resource";
};

export type LeasedSessionServices = {
	lists: ListService;
	items: ItemService;
	sync: SyncOperation;
};

export type SessionResourceLease = {
	services: LeasedSessionServices;
	retireAndClose: (options: {
		close: () => Promise<void>;
		stopSync?: () => Promise<void>;
		waitForDrain?: boolean;
	}) => Promise<void>;
};

export function createSessionResourceLease(
	services: LeasedSessionServices,
): SessionResourceLease {
	let retired = false;
	let inFlight = 0;
	const drainWaiters = new Set<() => void>();

	async function run<T>(operation: () => Promise<T>): Promise<T> {
		if (retired) throw staleAuthenticatedAppSessionResourceError();
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
			lists: {
				archiveList: (input) => run(() => services.lists.archiveList(input)),
				createList: (input) => run(() => services.lists.createList(input)),
				deleteList: (input) => run(() => services.lists.deleteList(input)),
				getList: (input) => run(() => services.lists.getList(input)),
				listLists: (input) => run(() => services.lists.listLists(input)),
				listActiveLists: () => run(() => services.lists.listActiveLists()),
				renameList: (input) => run(() => services.lists.renameList(input)),
				unarchiveList: (input) =>
					run(() => services.lists.unarchiveList(input)),
			},
			items: {
				listItems: (input) => run(() => services.items.listItems(input)),
				addItem: (input) => run(() => services.items.addItem(input)),
				setItemChecked: (input) =>
					run(() => services.items.setItemChecked(input)),
			},
			sync: (options) => run(() => services.sync(options)),
		},
		retireAndClose,
	};
}

export function staleAuthenticatedAppSessionResourceError(): StaleAuthenticatedAppSessionResourceError {
	return Object.assign(
		new Error("Authenticated app session resource is stale"),
		{
			code: "stale_authenticated_app_session_resource" as const,
		},
	);
}

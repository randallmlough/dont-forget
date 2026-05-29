import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import {
	type HouseholdDatabaseConfig,
	type HouseholdStoreExecutor,
	type OpenHouseholdStoreConfig,
	openHouseholdStore,
} from "@/lib/services/household/household-store";
import { createItemService, type ItemService } from "@/lib/services/item";
import { createListService, type ListService } from "@/lib/services/list";
import type { SyncOptions, SyncResult } from "@/lib/services/sync";

type SessionStore = HouseholdStoreExecutor & {
	syncAuthorized?: boolean;
	push?: () => Promise<void>;
	pull?: () => Promise<SyncResult>;
	sync?: () => Promise<SyncResult>;
	close: () => void | Promise<void>;
};

export type SessionDataServicesConfig = {
	householdId: string;
	database: HouseholdDatabaseConfig;
	logger: Logger;
};

export type SessionDataServicesOptions = {
	store?: SessionStore;
	openStore?: (config: OpenHouseholdStoreConfig) => Promise<SessionStore>;
};

export type SessionDataServices = {
	ready: Promise<void>;
	lists: ListService;
	items: ItemService;
	syncAuthorized: boolean;
	sync: (options?: SyncOptions) => Promise<SyncResult>;
	close: () => Promise<void>;
};

export function createSessionDataServices(
	config: SessionDataServicesConfig,
	options: SessionDataServicesOptions = {},
): SessionDataServices {
	const storePromise = options.store
		? Promise.resolve(options.store)
		: (options.openStore ?? openHouseholdStore)({
				householdId: config.householdId,
				database: config.database,
			});
	const ownsStore = !options.store;
	const ready = storePromise.then(() => undefined);
	const log = config.logger.with({
		feature: "authenticated_app_session_services",
	});
	const syncAuthorized = options.store
		? Boolean(
				options.store.syncAuthorized &&
					options.store.push &&
					options.store.sync,
			)
		: Boolean(config.database.url && config.database.authToken);
	let closed = false;
	let servicesPromise: Promise<{
		lists: ListService;
		items: ItemService;
	}> | null = null;

	function getServices() {
		servicesPromise ??= storePromise.then((store) => ({
			lists: createListService({
				householdId: config.householdId,
				store,
				logger: log,
			}),
			items: createItemService({
				householdId: config.householdId,
				store,
				logger: log,
			}),
		}));
		return servicesPromise;
	}

	return {
		ready,
		lists: {
			async getList(input) {
				const { lists } = await getServices();
				return lists.getList(input);
			},
		},
		items: {
			async listItems(input) {
				const { items } = await getServices();
				return items.listItems(input);
			},
			async addItem(input) {
				const { items } = await getServices();
				return items.addItem(input);
			},
			async setItemChecked(input) {
				const { items } = await getServices();
				return items.setItemChecked(input);
			},
		},
		syncAuthorized,
		async sync(syncOptions?: SyncOptions) {
			if (!syncAuthorized) return { changed: false };

			const store = await storePromise;
			if (syncOptions?.mode === "pushLocalOnly") {
				await store.push?.();
				return { changed: false };
			}

			return store.sync ? store.sync() : { changed: false };
		},
		async close() {
			if (!ownsStore || closed) return;
			closed = true;
			const store = await storePromise.catch(() => null);
			try {
				await store?.close();
			} catch (error) {
				log.error("authenticated app session data store close failed", {
					error: asError(error),
				});
				throw error;
			}
		},
	};
}

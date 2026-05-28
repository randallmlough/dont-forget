import { asError, isNetworkUnavailableError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import {
	type HouseholdDatabaseConfig,
	type HouseholdStoreExecutor,
	type OpenHouseholdStoreConfig,
	openHouseholdStore,
} from "@/lib/services/household/household-store";
import {
	type OpenHouseholdRemoteClient,
	pushLocalHouseholdRowsToRemote,
} from "@/lib/services/household/household-sync-fallback";
import { createItemService, type ItemService } from "@/lib/services/item";
import { createListService, type ListService } from "@/lib/services/list";
import type { SyncOptions, SyncResult } from "@/lib/services/sync";

type ActiveHouseholdStore = HouseholdStoreExecutor & {
	syncAuthorized?: boolean;
	push?: () => Promise<void>;
	pull?: () => Promise<SyncResult>;
	sync?: () => Promise<SyncResult>;
	close: () => void | Promise<void>;
};

export type ActiveHouseholdDataServicesConfig = {
	householdId: string;
	database: HouseholdDatabaseConfig;
	logger: Logger;
};

export type ActiveHouseholdDataServicesOptions = {
	store?: ActiveHouseholdStore;
	openStore?: (
		config: OpenHouseholdStoreConfig,
	) => Promise<ActiveHouseholdStore>;
	openRemoteClient?: OpenHouseholdRemoteClient;
};

export type ActiveHouseholdDataServices = {
	listService: ListService;
	itemService: ItemService;
	syncAuthorized: boolean;
	sync: (options?: SyncOptions) => Promise<SyncResult>;
	close: () => Promise<void>;
};

export function createActiveHouseholdDataServices(
	config: ActiveHouseholdDataServicesConfig,
	options: ActiveHouseholdDataServicesOptions = {},
): ActiveHouseholdDataServices {
	const storePromise = options.store
		? Promise.resolve(options.store)
		: (options.openStore ?? openHouseholdStore)({
				householdId: config.householdId,
				database: config.database,
			});
	const ownsStore = !options.store;
	const log = config.logger.with({ feature: "active_household_data" });
	const syncAuthorized = options.store
		? Boolean(
				options.store.syncAuthorized &&
					options.store.pull &&
					options.store.sync,
			)
		: Boolean(config.database.url && config.database.authToken);
	let closed = false;
	let servicesPromise: Promise<{
		listService: ListService;
		itemService: ItemService;
	}> | null = null;

	function getServices() {
		servicesPromise ??= storePromise.then((store) => ({
			listService: createListService({
				householdId: config.householdId,
				store,
				logger: log,
			}),
			itemService: createItemService({
				householdId: config.householdId,
				store,
				logger: log,
			}),
		}));
		return servicesPromise;
	}

	return {
		listService: {
			async getList(input) {
				const { listService } = await getServices();
				return listService.getList(input);
			},
		},
		itemService: {
			async listItems(input) {
				const { itemService } = await getServices();
				return itemService.listItems(input);
			},
			async addItem(input) {
				const { itemService } = await getServices();
				return itemService.addItem(input);
			},
			async setItemChecked(input) {
				const { itemService } = await getServices();
				return itemService.setItemChecked(input);
			},
		},
		syncAuthorized,
		async sync(syncOptions?: SyncOptions) {
			if (!syncAuthorized) return { changed: false };

			const store = await storePromise;
			if (syncOptions?.mode === "pushLocalOnly") {
				let nativeError: unknown = null;

				if (store.push) {
					try {
						await store.push();
						return { changed: false };
					} catch (error) {
						nativeError = error;
					}
				}
				if (isNetworkUnavailableError(nativeError)) {
					throw nativeError;
				}

				await pushLocalHouseholdRowsToRemote(
					store,
					config.database,
					options.openRemoteClient,
				);
				if (nativeError) {
					return {
						changed: false,
						recoveredNativeSyncError: asError(nativeError),
					};
				}
				return { changed: false };
			}

			let nativeResult: SyncResult = { changed: false };
			let nativeError: unknown = null;

			try {
				nativeResult = store.sync ? await store.sync() : { changed: false };
			} catch (error) {
				nativeError = error;
			}
			if (isNetworkUnavailableError(nativeError)) {
				throw nativeError;
			}

			try {
				await pushLocalHouseholdRowsToRemote(
					store,
					config.database,
					options.openRemoteClient,
				);
			} catch (fallbackError) {
				if (nativeError) {
					throw attachNativeSyncError(fallbackError, nativeError);
				}
				throw fallbackError;
			}
			if (nativeError) {
				return {
					changed: false,
					recoveredNativeSyncError: asError(nativeError),
				};
			}
			return nativeResult;
		},
		async close() {
			if (!ownsStore || closed) return;
			closed = true;
			const store = await storePromise.catch(() => null);
			try {
				await store?.close();
			} catch (error) {
				log.error("active Household data store close failed", {
					error: asError(error),
				});
				throw error;
			}
		},
	};
}

function attachNativeSyncError(
	fallbackError: unknown,
	nativeError: unknown,
): Error & { nativeSyncError: Error } {
	return Object.assign(asError(fallbackError), {
		nativeSyncError: asError(nativeError),
	});
}

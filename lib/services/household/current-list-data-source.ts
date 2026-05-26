import type {
	ActiveListDataSource,
	ActiveListItem,
	ActiveListSyncOptions,
	ActiveListSyncResult,
} from "@/components/active-list";
import type { BootstrapResponse } from "@/lib/bootstrap";
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
import { createItemService, type Item } from "@/lib/services/item";
import { createListService } from "@/lib/services/list";

type ActiveListStore = HouseholdStoreExecutor & {
	syncAuthorized?: boolean;
	push?: () => Promise<void>;
	pull?: () => Promise<ActiveListSyncResult>;
	sync?: () => Promise<ActiveListSyncResult>;
	close: () => void | Promise<void>;
};

export type HouseholdCurrentListDataSourceConfig = {
	household: BootstrapResponse["activeHousehold"];
	activeMember: BootstrapResponse["activeMember"];
	list: BootstrapResponse["activeList"];
	currentUser: BootstrapResponse["user"];
	members: BootstrapResponse["members"];
	database: HouseholdDatabaseConfig;
	logger: Logger;
};

type DataSourceOptions = {
	store?: ActiveListStore;
	openStore?: (config: OpenHouseholdStoreConfig) => Promise<ActiveListStore>;
	openRemoteClient?: OpenHouseholdRemoteClient;
};

type ActiveListServices = {
	listService: ReturnType<typeof createListService>;
	itemService: ReturnType<typeof createItemService>;
};

type CreateActiveListServicesInput = {
	storePromise: Promise<ActiveListStore>;
	householdId: string;
	logger: Logger;
};

export function createHouseholdCurrentListDataSource(
	config: HouseholdCurrentListDataSourceConfig,
	options: DataSourceOptions = {},
): ActiveListDataSource {
	const storePromise = options.store
		? Promise.resolve(options.store)
		: (options.openStore ?? openHouseholdStore)({
				householdId: config.household.id,
				database: config.database,
			});
	const ownsStore = !options.store;
	const memberNames = new Map<string, string | null>();
	const log = config.logger.with({
		list_id: config.list.id,
		feature: "active_list",
	});
	const syncAuthorized = options.store
		? Boolean(
				options.store.syncAuthorized &&
					options.store.pull &&
					options.store.sync,
			)
		: Boolean(config.database.url && config.database.authToken);
	let closed = false;

	for (const member of config.members) {
		memberNames.set(member.userId, member.displayName);
	}
	memberNames.set(
		config.activeMember.userId,
		config.activeMember.displayName ?? config.currentUser.displayName,
	);
	const getServices = createActiveListServicesGetter({
		storePromise,
		householdId: config.household.id,
		logger: log,
	});

	return {
		syncAuthorized,
		async load() {
			try {
				const { listService, itemService } = await getServices();
				const list = await listService.getList({ listId: config.list.id });
				const items = await itemService.listItems({ listId: config.list.id });

				return {
					householdName: config.household.name,
					listName: list.name,
					items: items.map((item) => activeListItemFromItem(item, memberNames)),
				};
			} catch (error) {
				log.error("active list load failed", { error: asError(error) });
				throw error;
			}
		},
		async addItem(rawName) {
			const { itemService } = await getServices();
			const item = await itemService.addItem({
				listId: config.list.id,
				userId: config.activeMember.userId,
				name: rawName,
			});

			return activeListItemFromItem(item, memberNames);
		},
		async setItemChecked(itemId, checked) {
			const { itemService } = await getServices();
			await itemService.setItemChecked({
				itemId,
				userId: config.activeMember.userId,
				checked,
			});
		},
		async pull() {
			if (!syncAuthorized) return { changed: false };

			try {
				const store = await storePromise;
				return store.pull ? await store.pull() : { changed: false };
			} catch (error) {
				log.error("active list pull failed", { error: asError(error) });
				throw error;
			}
		},
		async sync(syncOptions?: ActiveListSyncOptions) {
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

			let nativeResult: ActiveListSyncResult = { changed: false };
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
				log.error("active list store close failed", { error: asError(error) });
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

function createActiveListServicesGetter({
	storePromise,
	householdId,
	logger,
}: CreateActiveListServicesInput): () => Promise<ActiveListServices> {
	let servicesPromise: Promise<ActiveListServices> | null = null;

	return () => {
		servicesPromise ??= storePromise.then((store) => ({
			listService: createListService({
				householdId,
				store,
				logger,
			}),
			itemService: createItemService({
				householdId,
				store,
				logger,
			}),
		}));
		return servicesPromise;
	};
}

function activeListItemFromItem(
	item: Item,
	memberNames: Map<string, string | null>,
): ActiveListItem {
	return {
		id: item.id,
		name: item.name,
		checked: item.checked,
		checkedByMemberName:
			item.checked && item.checkedByUserId
				? (memberNames.get(item.checkedByUserId) ?? null)
				: null,
	};
}

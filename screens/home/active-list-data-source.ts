import type {
	ActiveListDataSource,
	ActiveListItem,
	ActiveListSyncOptions,
	ActiveListSyncResult,
} from "@/components/active-list";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { asError, isExpectedSyncInterruptionError } from "@/lib/errors";
import { logger } from "@/lib/logger";
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
	pull?: () => Promise<ActiveListSyncResult>;
	sync?: () => Promise<ActiveListSyncResult>;
	close: () => void | Promise<void>;
};

export type HouseholdActiveListDataSourceConfig = {
	household: BootstrapResponse["activeHousehold"];
	activeMember: BootstrapResponse["activeMember"];
	list: BootstrapResponse["activeList"];
	currentUser: BootstrapResponse["user"];
	members: BootstrapResponse["members"];
	database: HouseholdDatabaseConfig;
};

type DataSourceOptions = {
	store?: ActiveListStore;
	openStore?: (config: OpenHouseholdStoreConfig) => Promise<ActiveListStore>;
	openRemoteClient?: OpenHouseholdRemoteClient;
};

type ActiveListServices = {
	store: ActiveListStore;
	listService: ReturnType<typeof createListService>;
	itemService: ReturnType<typeof createItemService>;
};

type CreateActiveListServicesInput = {
	storePromise: Promise<ActiveListStore>;
	householdId: string;
};

export function createHouseholdActiveListDataSource(
	config: HouseholdActiveListDataSourceConfig,
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
	const log = logger.with({
		household_id: config.household.id,
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
				await pushLocalHouseholdRowsToRemote(
					store,
					config.database,
					options.openRemoteClient,
				);
				return { changed: false };
			}

			let nativeResult: ActiveListSyncResult = { changed: false };
			let nativeError: unknown = null;

			try {
				nativeResult = store.sync ? await store.sync() : { changed: false };
			} catch (error) {
				nativeError = error;
			}

			try {
				await pushLocalHouseholdRowsToRemote(
					store,
					config.database,
					options.openRemoteClient,
				);
				if (nativeError) {
					logRecoveredNativeSyncFailure(log, nativeError);
					return { changed: false };
				}
				return nativeResult;
			} catch (fallbackError) {
				if (nativeError) {
					logUnexpectedSyncFailure(
						log,
						"active list native sync failed",
						nativeError,
					);
				}
				logUnexpectedSyncFailure(
					log,
					"active list sync fallback failed",
					fallbackError,
				);
				if (nativeError) {
					throw fallbackError;
				}
				throw fallbackError;
			}
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

function createActiveListServicesGetter({
	storePromise,
	householdId,
}: CreateActiveListServicesInput): () => Promise<ActiveListServices> {
	let servicesPromise: Promise<ActiveListServices> | null = null;

	return () => {
		servicesPromise ??= storePromise.then((store) => ({
			store,
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

function logUnexpectedSyncFailure(
	log: ReturnType<typeof logger.with>,
	message: string,
	error: unknown,
) {
	if (isExpectedSyncInterruptionError(error)) return;

	log.error(message, { error: asError(error) });
}

function logRecoveredNativeSyncFailure(
	log: ReturnType<typeof logger.with>,
	error: unknown,
) {
	if (isExpectedSyncInterruptionError(error)) return;

	log.warn("active list native sync recovered by fallback", {
		error: asError(error),
	});
}

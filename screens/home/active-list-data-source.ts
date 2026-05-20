import type {
	ActiveListDataSource,
	ActiveListItem,
	ActiveListSyncResult,
} from "@/components/active-list";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { asError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
	type HouseholdDatabaseConfig,
	type HouseholdStore,
	type OpenHouseholdStoreConfig,
	openHouseholdStore,
} from "@/lib/services/household/household-store";
import {
	type OpenHouseholdRemoteClient,
	pushLocalHouseholdRowsToRemote,
} from "@/lib/services/household/household-sync-fallback";
import { createItemService, type Item } from "@/lib/services/item";
import { createListService } from "@/lib/services/list";

type ActiveListStore = {
	syncAuthorized?: boolean;
	execute: (
		statement: Parameters<HouseholdStore["execute"]>[0],
	) => Promise<{ rows: Record<string, unknown>[] }>;
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
			try {
				const { store, itemService } = await getServices();
				const item = await itemService.addItem({
					listId: config.list.id,
					userId: config.activeMember.userId,
					name: rawName,
				});

				requestSyncAfterLocalWrite(store, syncAuthorized, log);
				return activeListItemFromItem(item, memberNames);
			} catch (error) {
				log.error("active list item add failed", { error: asError(error) });
				throw error;
			}
		},
		async setItemChecked(itemId, checked) {
			try {
				const { store, itemService } = await getServices();
				await itemService.setItemChecked({
					itemId,
					userId: config.activeMember.userId,
					checked,
				});
				requestSyncAfterLocalWrite(store, syncAuthorized, log);
			} catch (error) {
				log.error("active list item check failed", {
					error: asError(error),
					item_id: itemId,
				});
				throw error;
			}
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
		async sync() {
			if (!syncAuthorized) return { changed: false };

			const store = await storePromise;
			try {
				return store.sync ? await store.sync() : { changed: false };
			} catch (error) {
				log.error("active list native sync failed", { error: asError(error) });
				try {
					await pushLocalHouseholdRowsToRemote(
						store,
						config.database,
						options.openRemoteClient,
					);
					log.warn("active list sync fallback succeeded");
				} catch (fallbackError) {
					log.error("active list sync fallback failed", {
						error: asError(fallbackError),
					});
					throw fallbackError;
				}
				return { changed: false };
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

function requestSyncAfterLocalWrite(
	store: ActiveListStore,
	syncAuthorized: boolean,
	log: ReturnType<typeof logger.with>,
) {
	if (!syncAuthorized || !store.sync) return;

	void store.sync().catch((error) => {
		log.warn("active list sync after local item write failed", {
			error: asError(error),
		});
	});
}

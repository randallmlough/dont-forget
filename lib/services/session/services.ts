import { ensureHouseholdSchemaReady } from "@/db/household-schema";
import {
	type HouseholdDatabaseConfig,
	type HouseholdStoreExecutor,
	type OpenHouseholdStoreConfig,
	openHouseholdStore,
} from "@/db/household-store";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { createItemService, type ItemService } from "@/lib/services/item";
import { createListService, type ListService } from "@/lib/services/list";
import type { SyncOptions, SyncResult } from "@/lib/services/sync";

type SessionStore = HouseholdStoreExecutor & {
	syncAuthorized?: boolean;
	push?: () => Promise<void>;
	sync?: () => Promise<SyncResult>;
	close: () => void | Promise<void>;
};

export type SessionDataServicesConfig = {
	householdId: string;
	userId: string;
	database: HouseholdDatabaseConfig;
	logger: Logger;
};

export type SessionDataServicesOptions = {
	store?: SessionStore;
	openStore?: (config: OpenHouseholdStoreConfig) => Promise<SessionStore>;
};

export type SessionDataServices = {
	lists: ListService;
	items: ItemService;
	syncAuthorized: boolean;
	sync: (options?: SyncOptions) => Promise<SyncResult>;
	close: () => Promise<void>;
};

export async function createSessionDataServices(
	config: SessionDataServicesConfig,
	options: SessionDataServicesOptions = {},
): Promise<SessionDataServices> {
	const store =
		options.store ??
		(await (options.openStore ?? openHouseholdStore)({
			householdId: config.householdId,
			database: config.database,
		}));
	const ownsStore = !options.store;
	const log = config.logger.with({
		feature: "authenticated_app_session_services",
	});
	const syncAuthorized = Boolean(
		store.syncAuthorized && store.push && store.sync,
	);
	// The gate intentionally runs before the session resource is published and
	// before the Sync Coordinator exists (resource-manager starts it after
	// publish), so it syncs through the store directly; the store's operation
	// queue serializes it against everything that follows.
	if (syncAuthorized && store.sync) {
		const storeSync = store.sync;
		await ensureHouseholdSchemaReady({
			store,
			sync: () => storeSync(),
			logger: log,
		});
	}
	let closed = false;
	const lists = createListService({
		householdId: config.householdId,
		userId: config.userId,
		store,
		logger: log,
	});
	const items = createItemService({
		householdId: config.householdId,
		store,
		logger: log,
	});

	return {
		lists,
		items,
		syncAuthorized,
		async sync(syncOptions?: SyncOptions) {
			if (!syncAuthorized) return { changed: false };

			if (syncOptions?.mode === "pushLocalOnly") {
				await store.push?.();
				return { changed: false };
			}

			return store.sync ? store.sync() : { changed: false };
		},
		async close() {
			if (!ownsStore || closed) return;
			closed = true;
			try {
				await store.close();
			} catch (error) {
				log.error("authenticated app session data store close failed", {
					error: asError(error),
				});
				throw error;
			}
		},
	};
}

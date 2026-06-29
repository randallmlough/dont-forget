import { readApiBaseUrl } from "@/lib/client-api/api-base-url";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import {
	type PowerSyncAppDatabase,
	PowerSyncConnector,
	type ProductSyncStatus,
	powerSyncAppDatabase,
	readPowerSyncUrl,
} from "@/lib/powersync";
import { createItemService, type ItemService } from "@/lib/services/item";
import { createListService, type ListService } from "@/lib/services/list";

export type SessionSyncStatusSource = {
	getStatus: () => ProductSyncStatus;
	subscribe: (listener: () => void) => { remove: () => void };
};

export type SessionDataServicesConfig = {
	householdId: string;
	userId: string;
	getSessionToken: () => Promise<string | null>;
	getPowerSyncToken: () => Promise<string | null>;
	logger: Logger;
};

export type SessionDataServicesOptions = {
	database?: PowerSyncAppDatabase;
	createConnector?: typeof createPowerSyncConnector;
	apiBaseUrl?: () => string;
	powerSyncUrl?: () => string;
};

export type SessionDataServices = {
	lists: ListService;
	items: ItemService;
	changes: {
		subscribe: (listener: () => void) => { remove: () => void };
	};
	sync: SessionSyncStatusSource;
	close: (options?: { clearLocalData?: boolean }) => Promise<void>;
};

export async function createSessionDataServices(
	config: SessionDataServicesConfig,
	options: SessionDataServicesOptions = {},
): Promise<SessionDataServices> {
	const database = options.database ?? powerSyncAppDatabase;
	const log = config.logger.with({
		feature: "authenticated_app_session_services",
	});
	const connector = (options.createConnector ?? createPowerSyncConnector)({
		getPowerSyncToken: config.getPowerSyncToken,
		getSessionToken: config.getSessionToken,
		apiBaseUrl: options.apiBaseUrl ?? readApiBaseUrl,
		powerSyncUrl: options.powerSyncUrl ?? readPowerSyncUrl,
	});

	await database.connect(connector);

	let closed = false;
	const lists = createListService({
		householdId: config.householdId,
		userId: config.userId,
		store: database,
		logger: log,
	});
	const items = createItemService({
		householdId: config.householdId,
		store: database,
		logger: log,
	});

	return {
		lists,
		items,
		changes: database.changes,
		sync: {
			getStatus: () => database.getStatus(),
			subscribe: (listener) => database.subscribeStatus(listener),
		},
		async close(options) {
			if (closed) return;
			closed = true;
			try {
				if (options?.clearLocalData) {
					await database.disconnectAndClear();
					return;
				}
				await database.disconnect();
			} catch (error) {
				log.error("authenticated app session data store close failed", {
					error: asError(error),
				});
				throw error;
			}
		},
	};
}

function createPowerSyncConnector(input: {
	getPowerSyncToken: () => Promise<string | null>;
	getSessionToken: () => Promise<string | null>;
	apiBaseUrl: () => string;
	powerSyncUrl: () => string;
}): PowerSyncConnector {
	return new PowerSyncConnector({
		powersyncGetToken: input.getPowerSyncToken,
		sessionGetToken: input.getSessionToken,
		apiBaseUrl: input.apiBaseUrl,
		powersyncUrl: input.powerSyncUrl(),
	});
}

import { readApiBaseUrl } from "@/client/lib/api-base-url";
import { readPowerSyncUrl } from "@/client/session/powersync/powersync-url";
import { asError } from "@/shared/errors";
import { logger as defaultLogger, type Logger } from "@/client/lib/logger";
import { PowerSyncConnector } from "@/client/session/powersync";
import { createItemService, type ItemService } from "@/lib/services/item";
import { createListService, type ListService } from "@/lib/services/list";
import {
	type ActiveMember,
	createSessionBootstrapService,
	type GetSessionToken,
	type Member,
	type SessionBootstrap,
	type SessionBootstrapService,
	type SessionUser,
} from "./bootstrap";
import {
	appProductDatabase,
	type ProductSyncStatus,
} from "./powersync-app-database";
import { markAuthenticatedAppSessionPresent } from "./session-hint";

export type AuthenticatedAppSessionStateSnapshot =
	| { status: "idle" }
	| {
			status: "loading";
			previous?: AuthenticatedAppSession;
			refreshingSession?: boolean;
	  }
	| { status: "error"; message: string; previous?: AuthenticatedAppSession }
	| { status: "ready"; session: AuthenticatedAppSession };

// The read-only sync-status seam the active-list UI subscribes to. PowerSync
// uploads continuously, so there is no manual sync request — only the current status
// and a change subscription (replaces the deleted sync-coordinator subsystem).
export type AuthenticatedAppSessionSync = {
	getStatus: () => ProductSyncStatus;
	subscribe: (listener: () => void) => { remove: () => void };
};

export type AuthenticatedAppSessionServices = {
	lists: ListService;
	items: ItemService;
	changes: {
		subscribe: (listener: () => void) => { remove: () => void };
	};
	sync: AuthenticatedAppSessionSync;
};

export type AuthenticatedAppSession = {
	user: SessionUser;
	activeHousehold: {
		id: string;
		name: string;
	};
	households: SessionBootstrap["households"];
	activeMember: ActiveMember;
	members: Member[];
	resourceKey: string;
	services: AuthenticatedAppSessionServices;
};

export type AuthenticatedAppSessionActivation = {
	getToken: GetSessionToken;
	getPowerSyncToken?: GetSessionToken;
	authReady: boolean;
	signedIn: boolean;
	cachePolicy?: AuthenticatedAppSessionCachePolicy;
};

type AuthenticatedAppSessionAuthState = "unknown" | "signedOut" | "signedIn";
export type AuthenticatedAppSessionCachePolicy = "allowCached" | "freshOnly";

type AuthenticatedAppSessionSubscriber = (
	snapshot: AuthenticatedAppSessionStateSnapshot,
) => void;

type ActivationRunGuard = {
	id: number;
	isCurrent: () => boolean;
};

export type AuthenticatedAppSessionController = {
	activate: (activation: AuthenticatedAppSessionActivation) => Promise<void>;
	dispose: (options?: { clearLocalData?: boolean }) => Promise<void>;
	getSnapshot: () => AuthenticatedAppSessionStateSnapshot;
	invalidateCurrentSession: () => Promise<void>;
	subscribe: (subscriber: AuthenticatedAppSessionSubscriber) => {
		remove: () => void;
	};
};

// The session's product-data services, built against the shared PowerSync DB.
// (Folded in from the former `services.ts`: with the per-Household store, the
// schema-staleness gate, and the Sync Coordinator all gone, there is no longer
// a separate assembler worth keeping — Decision 2, maximum debt removal.)
export type SessionDataServicesConfig = {
	householdId: string;
	userId: string;
	getSessionToken: GetSessionToken;
	getPowerSyncToken: GetSessionToken;
	logger: Logger;
};

export type SessionDataServices = {
	lists: ListService;
	items: ItemService;
	changes: {
		subscribe: (listener: () => void) => { remove: () => void };
	};
	sync: AuthenticatedAppSessionSync;
	close: (options?: { clearLocalData?: boolean }) => Promise<void>;
};

export type CreateSessionDataServices = (
	config: SessionDataServicesConfig,
) => Promise<SessionDataServices>;

export type AuthenticatedAppSessionControllerDeps = {
	bootstrap?: SessionBootstrapService;
	createDataServices?: CreateSessionDataServices;
	logger?: Logger;
};

const GENERIC_ERROR_MESSAGE =
	"Unable to prepare your Household. Please try again.";

async function defaultCreateDataServices(
	config: SessionDataServicesConfig,
): Promise<SessionDataServices> {
	const database = appProductDatabase;
	const log = config.logger.with({
		feature: "authenticated_app_session_services",
	});
	const connector = new PowerSyncConnector({
		powersyncGetToken: config.getPowerSyncToken,
		sessionGetToken: config.getSessionToken,
		apiBaseUrl: readApiBaseUrl,
		powersyncUrl: readPowerSyncUrl(),
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
		changes: {
			subscribe: (listener) => database.subscribeChanges(listener),
		},
		sync: {
			getStatus: () => database.getSyncStatus(),
			subscribe: (listener) => database.subscribeSyncStatus(listener),
		},
		async close(options) {
			if (closed) return;
			closed = true;
			try {
				// Sign-out wipes the local PowerSync data; a plain teardown (unmount,
				// Household switch) only disconnects so the cache survives a relaunch.
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

export function createAuthenticatedAppSessionController(
	deps: AuthenticatedAppSessionControllerDeps = {},
): AuthenticatedAppSessionController {
	const bootstrap = deps.bootstrap ?? createSessionBootstrapService();
	const createDataServices =
		deps.createDataServices ?? defaultCreateDataServices;
	const logger = deps.logger ?? defaultLogger;
	const subscribers = new Set<AuthenticatedAppSessionSubscriber>();
	let snapshot: AuthenticatedAppSessionStateSnapshot = { status: "idle" };
	let activationRun = 0;
	let activeServices: SessionDataServices | null = null;
	let nextResourceVersion = 1;

	function publish(nextSnapshot: AuthenticatedAppSessionStateSnapshot) {
		snapshot = nextSnapshot;
		for (const subscriber of subscribers) {
			subscriber(nextSnapshot);
		}
	}

	function startActivationRun(): ActivationRunGuard {
		const id = ++activationRun;
		return {
			id,
			isCurrent: () => id === activationRun,
		};
	}

	function publishLoading(previousSession?: AuthenticatedAppSession) {
		publish(
			previousSession
				? {
						status: "loading",
						previous: previousSession,
						refreshingSession: true,
					}
				: { status: "loading" },
		);
	}

	async function closeActiveServices(options?: { clearLocalData?: boolean }) {
		const services = activeServices;
		activeServices = null;
		if (services) {
			await services.close(options);
		}
	}

	async function handleSignedOutActivation(run: ActivationRunGuard) {
		await closeActiveServices().catch((error) => {
			logger.error("authenticated app session resource close failed", {
				error: asError(error),
			});
		});
		if (run.isCurrent()) publish({ status: "idle" });
	}

	async function publishFreshSessionForRun(
		session: SessionBootstrap,
		activation: AuthenticatedAppSessionActivation,
		run: ActivationRunGuard,
	): Promise<void> {
		const householdLogger = logger.with({
			household_id: session.activeHousehold.id,
		});
		let openedServices: SessionDataServices | null = await createDataServices({
			householdId: session.activeHousehold.id,
			userId: session.user.id,
			getSessionToken: activation.getToken,
			getPowerSyncToken: activation.getPowerSyncToken ?? activation.getToken,
			logger: householdLogger,
		});

		if (!run.isCurrent()) {
			await openedServices.close().catch(() => undefined);
			return;
		}

		// All sessions share the one PowerSync handle, so we must NOT close the
		// previous services here — close() would disconnect the handle the new
		// session just connected. Only sign-out (disconnectAndClear) and unmount
		// tear the connection down.
		activeServices = openedServices;
		openedServices = null;

		// resourceKey changes on every published session so `HomeCurrentList`
		// remounts when the active Household changes.
		const appSession = authenticatedAppSessionFromBootstrap(
			session,
			activeServices,
			`authenticated-app-session:${nextResourceVersion}`,
		);
		nextResourceVersion += 1;
		publish({ status: "ready", session: appSession });
		void markAuthenticatedAppSessionPresent().catch(() => undefined);
	}

	async function handleSignedInActivation(
		activation: AuthenticatedAppSessionActivation,
		run: ActivationRunGuard,
		cachePolicy: AuthenticatedAppSessionCachePolicy,
	) {
		try {
			const session = await bootstrap.getSession(activation.getToken);
			if (!run.isCurrent()) return;
			await publishFreshSessionForRun(session, activation, run);
		} catch (error) {
			await recoverActivationFailure(error, run, cachePolicy);
		}
	}

	async function recoverActivationFailure(
		error: unknown,
		run: ActivationRunGuard,
		cachePolicy: AuthenticatedAppSessionCachePolicy,
	) {
		logger.error("authenticated app session activation failed", {
			error: asError(error),
		});
		if (!run.isCurrent()) return;

		// Keep the previously-ready session on screen when a refresh fails, rather
		// than blanking to an error (PowerSync still serves the local data offline).
		const previousSession = previousSessionFromSnapshot(snapshot);
		if (cachePolicy === "allowCached" && previousSession) {
			publish({ status: "ready", session: previousSession });
			return;
		}

		await closeActiveServices().catch(() => undefined);
		publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
	}

	return {
		async activate(activation) {
			const run = startActivationRun();
			const cachePolicy = activation.cachePolicy ?? "allowCached";
			const authState =
				authenticatedAppSessionAuthStateFromActivation(activation);
			if (authState === "signedOut") {
				await handleSignedOutActivation(run);
				return;
			}

			publishLoading(previousSessionForActivation(cachePolicy, snapshot));

			if (authState === "unknown") {
				return;
			}

			await handleSignedInActivation(activation, run, cachePolicy);
		},

		async invalidateCurrentSession() {
			activationRun += 1;
			publish({ status: "loading" });
			await closeActiveServices().catch((error) => {
				logger.error("authenticated app session resource close failed", {
					error: asError(error),
				});
			});
		},

		async dispose(options) {
			activationRun += 1;
			publish({ status: "idle" });
			await closeActiveServices(options);
		},

		getSnapshot() {
			return snapshot;
		},

		subscribe(subscriber) {
			subscribers.add(subscriber);
			return {
				remove() {
					subscribers.delete(subscriber);
				},
			};
		},
	};
}

function previousSessionFromSnapshot(
	snapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSession | undefined {
	if (snapshot.status === "ready") return snapshot.session;
	if (snapshot.status === "loading" || snapshot.status === "error") {
		return snapshot.previous;
	}
	return undefined;
}

function previousSessionForActivation(
	cachePolicy: AuthenticatedAppSessionCachePolicy,
	snapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSession | undefined {
	if (cachePolicy === "freshOnly") return undefined;
	return previousSessionFromSnapshot(snapshot);
}

function authenticatedAppSessionAuthStateFromActivation(
	activation: AuthenticatedAppSessionActivation,
): AuthenticatedAppSessionAuthState {
	if (!activation.authReady) return "unknown";
	return activation.signedIn ? "signedIn" : "signedOut";
}

function authenticatedAppSessionFromBootstrap(
	session: SessionBootstrap,
	services: SessionDataServices,
	resourceKey: string,
): AuthenticatedAppSession {
	return {
		user: session.user,
		activeHousehold: session.activeHousehold,
		households: session.households,
		activeMember: session.activeMember,
		members: session.members,
		resourceKey,
		services: {
			lists: services.lists,
			items: services.items,
			changes: services.changes,
			sync: services.sync,
		},
	};
}

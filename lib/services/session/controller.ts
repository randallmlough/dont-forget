import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import {
	createDefaultSyncCoordinator,
	type SyncCoordinator,
} from "@/lib/services/sync";
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
	type CachedSessionBootstrap,
	createSessionCache,
	type SessionCache,
} from "./cache";
import {
	type CreateSessionDataServices,
	type CreateSyncCoordinator,
	createSessionResourceManager,
	type OpenedSessionResource,
	type SessionResourceBootstrap,
} from "./resource-manager";
import { createSessionDataServices } from "./services";

export type AuthenticatedAppSessionStateSnapshot =
	| { status: "idle" }
	| {
			status: "loading";
			previous?: AuthenticatedAppSession;
			refreshingSession?: boolean;
	  }
	| { status: "error"; message: string; previous?: AuthenticatedAppSession }
	| { status: "ready"; session: AuthenticatedAppSession };

export type AuthenticatedAppSessionSync = Pick<
	SyncCoordinator,
	"getStatus" | "subscribe" | "requestSync"
>;

export type AuthenticatedAppSessionServices = {
	lists: ListService;
	items: ItemService;
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
	authReady: boolean;
	signedIn: boolean;
};

type AuthenticatedAppSessionAuthState = "unknown" | "signedOut" | "signedIn";

type AuthenticatedAppSessionSubscriber = (
	snapshot: AuthenticatedAppSessionStateSnapshot,
) => void;

type ActivationRunGuard = {
	id: number;
	isCurrent: () => boolean;
};

type CachedActivationAttempt = {
	promise: Promise<boolean>;
	invalidateHousehold: (cached: CachedSessionBootstrap) => void;
	markFreshPublished: () => void;
	throwDiscardCloseError: () => void;
};

export type AuthenticatedAppSessionController = {
	activate: (activation: AuthenticatedAppSessionActivation) => Promise<void>;
	dispose: () => Promise<AuthenticatedAppSessionDisposal>;
	getSnapshot: () => AuthenticatedAppSessionStateSnapshot;
	subscribe: (subscriber: AuthenticatedAppSessionSubscriber) => {
		remove: () => void;
	};
};

export type AuthenticatedAppSessionDisposal = {
	householdIdsForLocalDataDeletion: string[];
};

export type AuthenticatedAppSessionControllerDeps = {
	bootstrap?: SessionBootstrapService;
	cache?: SessionCache;
	createDataServices?: CreateSessionDataServices;
	createSyncCoordinator?: CreateSyncCoordinator;
	logger?: Logger;
};

const GENERIC_ERROR_MESSAGE =
	"Unable to prepare your Household. Please try again.";

export function createAuthenticatedAppSessionController(
	deps: AuthenticatedAppSessionControllerDeps = {},
): AuthenticatedAppSessionController {
	const bootstrap = deps.bootstrap ?? createSessionBootstrapService();
	const cache = deps.cache ?? createSessionCache();
	const createDataServices =
		deps.createDataServices ?? createSessionDataServices;
	const createSyncCoordinator =
		deps.createSyncCoordinator ?? createDefaultSyncCoordinator;
	const logger = deps.logger ?? defaultLogger;
	const subscribers = new Set<AuthenticatedAppSessionSubscriber>();
	let snapshot: AuthenticatedAppSessionStateSnapshot = { status: "idle" };
	let activationRun = 0;
	let cacheWriteQueue: Promise<void> = Promise.resolve();
	const resources = createSessionResourceManager({
		createDataServices,
		createSyncCoordinator,
		logger,
	});

	function publish(nextSnapshot: AuthenticatedAppSessionStateSnapshot) {
		snapshot = nextSnapshot;
		for (const subscriber of subscribers) {
			subscriber(nextSnapshot);
		}
	}

	function saveFreshSession(session: SessionBootstrap) {
		const write = cacheWriteQueue
			.catch(() => undefined)
			.then(async () => {
				await cache.save(session).catch(() => undefined);
			});
		cacheWriteQueue = write;
	}

	async function drainCacheWrites() {
		await cacheWriteQueue.catch(() => undefined);
	}

	async function publishOpened(
		opened: OpenedSessionResource,
		session: SessionResourceBootstrap,
		run: number,
		options: {
			startSync: boolean;
			shouldPublish?: () => boolean;
			onPublished?: () => void;
			onDiscardCloseError?: (error: unknown) => void;
		},
	): Promise<boolean> {
		return resources.publishOpenedResource(opened, session, {
			startSync: options.startSync,
			shouldPublish: () =>
				run === activationRun && options.shouldPublish?.() !== false,
			publish: (published) => {
				const appSession = authenticatedAppSessionFromOpened(
					published,
					session,
				);
				publish({ status: "ready", session: appSession });
			},
			onPublished: options.onPublished,
			onDiscardCloseError: options.onDiscardCloseError,
		});
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

	function publishLoadingFromCurrentSession() {
		const previousSession = previousSessionFromSnapshot(snapshot);
		if (previousSession) {
			publishLoading(previousSession);
		}
	}

	function startCachedActivationAttempt(
		run: ActivationRunGuard,
	): CachedActivationAttempt {
		const invalidatedHouseholdIds = new Set<string>();
		let freshPublished = false;
		let discardCloseError: unknown = null;

		return {
			promise: (async (): Promise<boolean> => {
				const cached = await cache.read().catch(() => null);
				if (
					!cached ||
					!run.isCurrent() ||
					invalidatedHouseholdIds.has(cached.activeHousehold.id)
				) {
					return false;
				}

				try {
					const opened = await resources.openSessionResource(cached);
					return await publishOpened(opened, cached, run.id, {
						startSync: false,
						shouldPublish: () =>
							!freshPublished &&
							!invalidatedHouseholdIds.has(cached.activeHousehold.id),
						onDiscardCloseError: (error) => {
							discardCloseError = error;
						},
					});
				} catch {
					return false;
				}
			})(),
			invalidateHousehold(cached) {
				invalidatedHouseholdIds.add(cached.activeHousehold.id);
			},
			markFreshPublished() {
				freshPublished = true;
			},
			throwDiscardCloseError() {
				if (discardCloseError) throw discardCloseError;
			},
		};
	}

	async function handleSignedOutActivation(run: ActivationRunGuard) {
		await Promise.allSettled([
			drainCacheWrites(),
			resources.closeOpeningResources(),
			resources.closeActiveResource(),
		]).then((results) => {
			for (const result of results) {
				if (result.status === "rejected") {
					logger.error("authenticated app session resource close failed", {
						error: asError(result.reason),
					});
				}
			}
		});
		if (run.isCurrent()) publish({ status: "idle" });
	}

	async function loadFreshSessionForRun(
		run: ActivationRunGuard,
		getToken: GetSessionToken,
	): Promise<SessionBootstrap | null> {
		const session = await bootstrap.getSession(getToken);
		return run.isCurrent() ? session : null;
	}

	async function invalidateUnauthorizedCachedSessionForFreshRun(
		freshSession: SessionBootstrap,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
	): Promise<boolean> {
		const cached = await cache.readUnauthorized(freshSession);
		if (!cached || !run.isCurrent()) return false;

		cachedAttempt.invalidateHousehold(cached);
		publish({ status: "loading" });
		await resources.closeUnauthorizedCachedResource(cached);
		await cachedAttempt.promise;
		cachedAttempt.throwDiscardCloseError();
		if (!run.isCurrent()) return true;

		await cache.deleteLocalData(cached);
		if (!run.isCurrent()) return true;

		await cache.clearUnauthorizedMetadata(cached, freshSession);
		return true;
	}

	async function publishFreshSessionForRun(
		session: SessionBootstrap,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
	) {
		publishLoadingFromCurrentSession();
		const opened = await resources.openSessionResource(session);
		if (!run.isCurrent()) {
			await publishOpened(opened, session, run.id, {
				startSync: false,
				shouldPublish: () => false,
			});
			return;
		}

		await publishOpened(opened, session, run.id, {
			startSync: true,
			onPublished: () => {
				saveFreshSession(session);
				cachedAttempt.markFreshPublished();
			},
		});
	}

	async function handleSignedInActivation(
		activation: AuthenticatedAppSessionActivation,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
	) {
		let invalidatedUnauthorizedCached = false;
		try {
			const session = await loadFreshSessionForRun(run, activation.getToken);
			if (!session) return;
			invalidatedUnauthorizedCached =
				await invalidateUnauthorizedCachedSessionForFreshRun(
					session,
					run,
					cachedAttempt,
				);
			if (!run.isCurrent()) return;
			await publishFreshSessionForRun(session, run, cachedAttempt);
		} catch (error) {
			await recoverActivationFailure(error, run, cachedAttempt, {
				invalidatedUnauthorizedCached,
			});
		}
	}

	async function recoverActivationFailure(
		error: unknown,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
		options: { invalidatedUnauthorizedCached: boolean },
	) {
		logger.error("authenticated app session activation failed", {
			error: asError(error),
		});

		const publishedCached = await cachedAttempt.promise;
		if (publishedCached && run.isCurrent()) {
			const previousSession = previousSessionFromSnapshot(snapshot);
			if (previousSession && !options.invalidatedUnauthorizedCached) {
				publish({ status: "ready", session: previousSession });
			} else {
				publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
			}
		} else if (!publishedCached && run.isCurrent()) {
			const previousSession = previousSessionFromSnapshot(snapshot);
			if (previousSession) {
				publish({ status: "ready", session: previousSession });
				return;
			}
			await resources.closeActiveResource().catch(() => undefined);
			publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
		}
	}

	return {
		async activate(activation) {
			const run = startActivationRun();
			const authState =
				authenticatedAppSessionAuthStateFromActivation(activation);
			if (authState === "signedOut") {
				await handleSignedOutActivation(run);
				return;
			}

			publishLoading(previousSessionFromSnapshot(snapshot));

			const cachedAttempt = startCachedActivationAttempt(run);
			if (authState === "unknown") {
				await cachedAttempt.promise;
				return;
			}

			await handleSignedInActivation(activation, run, cachedAttempt);
		},

		async dispose() {
			const disposal = {
				householdIdsForLocalDataDeletion: resources.getHouseholdIds(),
			};
			activationRun += 1;
			publish({ status: "idle" });
			const results = await Promise.allSettled([
				drainCacheWrites(),
				resources.closeOpeningResources(),
				resources.closeActiveResource(),
			]);
			const rejected = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (rejected) {
				throw rejected.reason;
			}
			return disposal;
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

function authenticatedAppSessionAuthStateFromActivation(
	activation: AuthenticatedAppSessionActivation,
): AuthenticatedAppSessionAuthState {
	if (!activation.authReady) return "unknown";
	return activation.signedIn ? "signedIn" : "signedOut";
}

function syncHandleFromCoordinator(
	syncCoordinator: SyncCoordinator,
): AuthenticatedAppSessionSync {
	return {
		getStatus: syncCoordinator.getStatus,
		subscribe: syncCoordinator.subscribe,
		requestSync: syncCoordinator.requestSync,
	};
}

function authenticatedAppSessionFromOpened(
	opened: OpenedSessionResource,
	session: SessionResourceBootstrap,
): AuthenticatedAppSession {
	return {
		user: session.user,
		activeHousehold: session.activeHousehold,
		households: session.households,
		activeMember: session.activeMember,
		members: session.members,
		resourceKey: opened.resourceKey,
		services: {
			lists: opened.resource.lists,
			items: opened.resource.items,
			sync: syncHandleFromCoordinator(opened.resource.syncCoordinator),
		},
	};
}

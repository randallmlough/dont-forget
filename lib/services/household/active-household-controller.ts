import type {
	ActiveListDataSource,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import { createDefaultSyncCoordinator } from "@/lib/services/sync";
import {
	type ActiveHouseholdSession,
	type CreateCurrentListDataSource,
	type CreateSyncCoordinator,
	createActiveHouseholdResourceManager,
	type OpenedActiveHouseholdResource,
} from "./active-household-resource-manager";
import { createHouseholdCurrentListDataSource } from "./current-list-data-source";
import {
	type CachedHouseholdSession,
	createHouseholdSessionService,
	type GetHouseholdSessionToken,
	type HouseholdSession,
	type HouseholdSessionService,
} from "./household-session-service";

export type ActiveHouseholdSnapshot =
	| { status: "idle" }
	| {
			status: "loading";
			previous?: ActiveHouseholdView;
			refreshingSession?: boolean;
	  }
	| { status: "error"; message: string; previous?: ActiveHouseholdView }
	| { status: "ready"; view: ActiveHouseholdView };

export type ActiveHouseholdView = {
	activeMemberName: string;
	currentList: {
		resourceKey: string;
		dataSource: ActiveListDataSource;
		syncCoordinator: ActiveListSyncCoordinator;
	};
};

export type ActiveHouseholdActivation = {
	getToken: GetHouseholdSessionToken;
	authReady: boolean;
	signedIn: boolean;
};

type ActiveHouseholdAuthState = "unknown" | "signedOut" | "signedIn";

type ActiveHouseholdSubscriber = (snapshot: ActiveHouseholdSnapshot) => void;

type ActivationRunGuard = {
	id: number;
	isCurrent: () => boolean;
};

type CachedActivationAttempt = {
	promise: Promise<boolean>;
	invalidateHousehold: (cached: CachedHouseholdSession) => void;
	markFreshPublished: () => void;
	throwDiscardCloseError: () => void;
};

export type ActiveHouseholdController = {
	activate: (activation: ActiveHouseholdActivation) => Promise<void>;
	dispose: () => Promise<ActiveHouseholdDisposal>;
	getSnapshot: () => ActiveHouseholdSnapshot;
	subscribe: (subscriber: ActiveHouseholdSubscriber) => { remove: () => void };
};

export type ActiveHouseholdDisposal = {
	householdIdsForLocalDataDeletion: string[];
};

export type ActiveHouseholdControllerDeps = {
	householdSessionService?: HouseholdSessionService;
	createCurrentListDataSource?: CreateCurrentListDataSource;
	createSyncCoordinator?: CreateSyncCoordinator;
	logger?: Logger;
};

const GENERIC_ERROR_MESSAGE =
	"Unable to prepare your Household. Please try again.";

export function createActiveHouseholdController(
	deps: ActiveHouseholdControllerDeps = {},
): ActiveHouseholdController {
	const householdSessionService =
		deps.householdSessionService ?? createHouseholdSessionService();
	const createCurrentListDataSource =
		deps.createCurrentListDataSource ?? createHouseholdCurrentListDataSource;
	const createSyncCoordinator =
		deps.createSyncCoordinator ?? createDefaultSyncCoordinator;
	const logger = deps.logger ?? defaultLogger;
	const subscribers = new Set<ActiveHouseholdSubscriber>();
	let snapshot: ActiveHouseholdSnapshot = { status: "idle" };
	let activationRun = 0;
	let cacheWriteQueue: Promise<void> = Promise.resolve();
	const resources = createActiveHouseholdResourceManager({
		createCurrentListDataSource,
		createSyncCoordinator,
		logger,
	});

	function publish(nextSnapshot: ActiveHouseholdSnapshot) {
		snapshot = nextSnapshot;
		for (const subscriber of subscribers) {
			subscriber(nextSnapshot);
		}
	}

	function saveFreshSession(session: HouseholdSession) {
		const write = cacheWriteQueue
			.catch(() => undefined)
			.then(async () => {
				await householdSessionService
					.saveCachedHouseholdSession(session)
					.catch(() => undefined);
			});
		cacheWriteQueue = write;
	}

	async function drainCacheWrites() {
		await cacheWriteQueue.catch(() => undefined);
	}

	async function publishOpened(
		opened: OpenedActiveHouseholdResource,
		session: ActiveHouseholdSession,
		run: number,
		options: {
			startSync: boolean;
			shouldPublish?: () => boolean;
			onPublished?: () => void;
			onDiscardCloseError?: (error: unknown) => void;
		},
	): Promise<boolean> {
		if (run !== activationRun || options.shouldPublish?.() === false) {
			await resources.closeResource(opened.resource).catch((error) => {
				options.onDiscardCloseError?.(error);
			});
			return false;
		}

		const previousResource = resources.replaceActiveResource(
			opened.resource,
			session,
		);
		const view = activeHouseholdViewFromOpened(opened, session);
		publish({ status: "ready", view });
		options.onPublished?.();
		if (options.startSync) {
			view.currentList.syncCoordinator.start();
		}

		if (previousResource) {
			const closePreviousResource = resources.closeResource(previousResource);
			await Promise.resolve();
			await closePreviousResource;
		}
		return true;
	}

	function startActivationRun(): ActivationRunGuard {
		const id = ++activationRun;
		return {
			id,
			isCurrent: () => id === activationRun,
		};
	}

	function publishLoading(previousView?: ActiveHouseholdView) {
		publish(
			previousView
				? {
						status: "loading",
						previous: previousView,
						refreshingSession: true,
					}
				: { status: "loading" },
		);
	}

	function publishLoadingFromCurrentView() {
		const previousView = previousViewFromSnapshot(snapshot);
		if (previousView) {
			publishLoading(previousView);
		}
	}

	function startCachedActivationAttempt(
		run: ActivationRunGuard,
	): CachedActivationAttempt {
		const invalidatedCachedHouseholds = new Set<string>();
		let freshPublished = false;
		let discardCloseError: unknown = null;

		return {
			promise: (async (): Promise<boolean> => {
				const cached = await householdSessionService
					.readCachedHouseholdSession()
					.catch(() => null);
				if (
					!cached ||
					!run.isCurrent() ||
					invalidatedCachedHouseholds.has(cached.activeHousehold.id)
				) {
					return false;
				}

				try {
					const opened = await resources.openSessionResource(cached);
					return await publishOpened(opened, cached, run.id, {
						startSync: false,
						shouldPublish: () =>
							!freshPublished &&
							!invalidatedCachedHouseholds.has(cached.activeHousehold.id),
						onDiscardCloseError: (error) => {
							discardCloseError = error;
						},
					});
				} catch {
					return false;
				}
			})(),
			invalidateHousehold(cached) {
				invalidatedCachedHouseholds.add(cached.activeHousehold.id);
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
					logger.error("active Household resource close failed", {
						error: asError(result.reason),
					});
				}
			}
		});
		if (run.isCurrent()) publish({ status: "idle" });
	}

	async function loadFreshSessionForRun(
		run: ActivationRunGuard,
		getToken: GetHouseholdSessionToken,
	): Promise<HouseholdSession | null> {
		const session = await householdSessionService.getHouseholdSession(getToken);
		return run.isCurrent() ? session : null;
	}

	async function invalidateUnauthorizedCachedSessionForFreshRun(
		freshSession: HouseholdSession,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
	): Promise<boolean> {
		const cached =
			await householdSessionService.readUnauthorizedCachedHouseholdSession(
				freshSession,
			);
		if (!cached || !run.isCurrent()) return false;

		cachedAttempt.invalidateHousehold(cached);
		publish({ status: "loading" });
		await resources.closeUnauthorizedCachedResource(cached);
		await cachedAttempt.promise;
		cachedAttempt.throwDiscardCloseError();
		if (!run.isCurrent()) return true;

		await householdSessionService.deleteCachedHouseholdSessionLocalData(cached);
		if (!run.isCurrent()) return true;

		await householdSessionService.clearUnauthorizedCachedHouseholdSessionMetadata(
			cached,
			freshSession,
		);
		return true;
	}

	async function publishFreshSessionForRun(
		session: HouseholdSession,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
	) {
		publishLoadingFromCurrentView();
		const opened = await resources.openSessionResource(session);
		if (!run.isCurrent()) {
			await resources.closeResource(opened.resource).catch(() => undefined);
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
		activation: ActiveHouseholdActivation,
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
		logger.error("active Household activation failed", {
			error: asError(error),
		});

		const publishedCached = await cachedAttempt.promise;
		if (publishedCached && run.isCurrent()) {
			const previousView = previousViewFromSnapshot(snapshot);
			if (previousView && !options.invalidatedUnauthorizedCached) {
				publish({ status: "ready", view: previousView });
			} else {
				publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
			}
		} else if (!publishedCached && run.isCurrent()) {
			const previousView = previousViewFromSnapshot(snapshot);
			if (previousView) {
				publish({ status: "ready", view: previousView });
				return;
			}
			await resources.closeActiveResource().catch(() => undefined);
			publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
		}
	}

	return {
		async activate(activation) {
			const run = startActivationRun();
			const authState = activeHouseholdAuthStateFromActivation(activation);
			if (authState === "signedOut") {
				await handleSignedOutActivation(run);
				return;
			}

			publishLoading(previousViewFromSnapshot(snapshot));

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

function previousViewFromSnapshot(
	snapshot: ActiveHouseholdSnapshot,
): ActiveHouseholdView | undefined {
	if (snapshot.status === "ready") return snapshot.view;
	if (snapshot.status === "loading" || snapshot.status === "error") {
		return snapshot.previous;
	}
	return undefined;
}

function activeHouseholdAuthStateFromActivation(
	activation: ActiveHouseholdActivation,
): ActiveHouseholdAuthState {
	if (!activation.authReady) return "unknown";
	return activation.signedIn ? "signedIn" : "signedOut";
}

function activeHouseholdViewFromOpened(
	opened: OpenedActiveHouseholdResource,
	session: ActiveHouseholdSession,
): ActiveHouseholdView {
	return {
		activeMemberName: activeMemberNameFromSession(session),
		currentList: {
			resourceKey: opened.resourceKey,
			dataSource: opened.resource.dataSource,
			syncCoordinator: opened.resource.syncCoordinator,
		},
	};
}

function activeMemberNameFromSession(session: ActiveHouseholdSession): string {
	return session.activeMember.displayName ?? session.user.email ?? "Member";
}

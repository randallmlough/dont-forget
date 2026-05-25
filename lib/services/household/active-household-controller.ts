import type {
	ActiveListDataSource,
	ActiveListInitialState,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import { asError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import { logger as defaultLogger } from "@/lib/logger";
import { createDefaultSyncCoordinator } from "@/lib/services/sync";
import {
	createHouseholdCurrentListDataSource,
	type HouseholdCurrentListDataSourceConfig,
} from "./current-list-data-source";
import {
	createCurrentListResourceLease,
	staleCurrentListResourceError,
} from "./current-list-resource-lease";
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
		initialState: ActiveListInitialState;
		dataSource: ActiveListDataSource;
		syncCoordinator: ActiveListSyncCoordinator;
	};
};

export type ActiveHouseholdActivation = {
	getToken: GetHouseholdSessionToken;
	authReady: boolean;
	signedIn: boolean;
};

type ActiveHouseholdSession = HouseholdSession | CachedHouseholdSession;

type ActiveHouseholdResource = {
	dataSource: ActiveListDataSource;
	drainDataSource: () => Promise<void>;
	closeDataSource: () => Promise<void>;
	retireDataSource: () => void;
	syncCoordinator: ActiveListSyncCoordinator;
};

type OpeningActiveHouseholdResource = {
	session: ActiveHouseholdSession;
	resource: ActiveHouseholdResource;
	closePromise?: Promise<void>;
};

type OpenedActiveHouseholdResource = {
	resource: ActiveHouseholdResource;
	view: ActiveHouseholdView;
};

type ActiveHouseholdSubscriber = (snapshot: ActiveHouseholdSnapshot) => void;

type CreateCurrentListDataSource = (
	config: HouseholdCurrentListDataSourceConfig,
) => ActiveListDataSource;

type CreateSyncCoordinator = (config: {
	syncAuthorized: boolean;
	sync: ActiveListDataSource["sync"];
	logger: Logger;
}) => ActiveListSyncCoordinator;

export type ActiveHouseholdController = {
	activate: (activation: ActiveHouseholdActivation) => Promise<void>;
	dispose: () => Promise<void>;
	getSnapshot: () => ActiveHouseholdSnapshot;
	subscribe: (subscriber: ActiveHouseholdSubscriber) => { remove: () => void };
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
	let activeResource: ActiveHouseholdResource | null = null;
	let activeResourceSession: ActiveHouseholdSession | null = null;
	const openingResources = new Set<OpeningActiveHouseholdResource>();
	let activationRun = 0;
	let cacheWriteQueue: Promise<void> = Promise.resolve();
	let nextResourceVersion = 1;

	function publish(nextSnapshot: ActiveHouseholdSnapshot) {
		snapshot = nextSnapshot;
		for (const subscriber of subscribers) {
			subscriber(nextSnapshot);
		}
	}

	async function closeResource(resource: ActiveHouseholdResource) {
		resource.retireDataSource();
		let stopError: unknown = null;
		await resource.drainDataSource();
		try {
			await resource.syncCoordinator.stop();
		} catch (error) {
			stopError = error;
		}

		try {
			await resource.closeDataSource();
		} catch (closeError) {
			if (stopError) {
				throw Object.assign(asError(closeError), {
					syncStopError: asError(stopError),
				});
			}
			throw closeError;
		}

		if (stopError) {
			throw stopError;
		}
	}

	function publishResource(
		resource: ActiveHouseholdResource,
		session: ActiveHouseholdSession,
	): ActiveHouseholdResource | null {
		const previousResource = activeResource;
		activeResource = resource;
		activeResourceSession = session;
		return previousResource && previousResource !== resource
			? previousResource
			: null;
	}

	async function closeActiveResource() {
		const resource = activeResource;
		activeResource = null;
		activeResourceSession = null;
		if (resource) {
			await closeResource(resource);
		}
	}

	async function closeOpeningResources() {
		const results = await Promise.allSettled(
			Array.from(openingResources, closeOpeningResource),
		);
		const rejected = results.find(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (rejected) {
			throw rejected.reason;
		}
	}

	async function openSessionResource(
		session: ActiveHouseholdSession,
	): Promise<OpenedActiveHouseholdResource> {
		const rawDataSource = createCurrentListDataSource({
			household: session.activeHousehold,
			activeMember: session.activeMember,
			list: session.activeList,
			currentUser: session.user,
			members: session.members,
			database: session.householdDatabase,
		});
		const lease = createCurrentListResourceLease(rawDataSource);
		const dataSource = lease.dataSource;
		const syncCoordinator = createSyncCoordinator({
			syncAuthorized: dataSource.syncAuthorized,
			sync: dataSource.sync,
			logger: logger.with({ household_id: session.activeHousehold.id }),
		});
		const resource = {
			dataSource,
			drainDataSource: lease.waitForDrain,
			closeDataSource: lease.close,
			retireDataSource: lease.retire,
			syncCoordinator,
		};
		const opening: OpeningActiveHouseholdResource = { session, resource };
		openingResources.add(opening);

		try {
			const initialState = await dataSource.load();
			if (opening.closePromise) {
				await opening.closePromise;
				throw staleCurrentListResourceError();
			}
			const resourceKey = `current-list:${nextResourceVersion}`;
			nextResourceVersion += 1;
			return {
				resource,
				view: {
					activeMemberName: activeMemberNameFromSession(session),
					currentList: {
						resourceKey,
						initialState,
						dataSource,
						syncCoordinator,
					},
				},
			};
		} catch (error) {
			if (!opening.closePromise) {
				await closeResource(resource).catch(() => undefined);
			}
			throw error;
		} finally {
			openingResources.delete(opening);
		}
	}

	async function saveFreshSessionIfCurrent(
		session: HouseholdSession,
		run: number,
	) {
		const write = cacheWriteQueue
			.catch(() => undefined)
			.then(async () => {
				if (run !== activationRun) return;
				await householdSessionService
					.saveCachedHouseholdSession(session)
					.catch(() => undefined);
			});
		cacheWriteQueue = write;
		await write;
	}

	async function closeUnauthorizedCachedResource(
		cached: CachedHouseholdSession,
	) {
		for (const opening of openingResources) {
			if (isUnauthorizedCachedSession(opening.session, cached)) {
				await closeOpeningResource(opening);
			}
		}

		const resource = activeResource;
		const session = activeResourceSession;
		if (resource && session && isUnauthorizedCachedSession(session, cached)) {
			activeResource = null;
			activeResourceSession = null;
			await closeResource(resource);
		}
	}

	function closeOpeningResource(opening: OpeningActiveHouseholdResource) {
		opening.closePromise ??= closeResource(opening.resource);
		return opening.closePromise;
	}

	async function publishOpened(
		opened: OpenedActiveHouseholdResource,
		session: ActiveHouseholdSession,
		run: number,
		options: {
			startSync: boolean;
			shouldPublish?: () => boolean;
			onPublished?: () => void;
		},
	): Promise<boolean> {
		if (run !== activationRun || options.shouldPublish?.() === false) {
			await closeResource(opened.resource).catch(() => undefined);
			return false;
		}

		const previousResource = publishResource(opened.resource, session);
		publish({ status: "ready", view: opened.view });
		options.onPublished?.();
		if (options.startSync) {
			opened.view.currentList.syncCoordinator.start();
		}

		if (previousResource) {
			previousResource.retireDataSource();
			await Promise.resolve();
			await closeResource(previousResource);
		}
		return true;
	}

	return {
		async activate(activation) {
			const run = ++activationRun;
			const previousView = previousViewFromSnapshot(snapshot);
			publish(
				previousView
					? {
							status: "loading",
							previous: previousView,
							refreshingSession: true,
						}
					: { status: "loading" },
			);

			const invalidatedCachedHouseholds = new Set<string>();
			let freshPublished = false;
			let invalidatedUnauthorizedCached = false;
			const cachedAttempt = (async (): Promise<boolean> => {
				const cached = await householdSessionService
					.readCachedHouseholdSession()
					.catch(() => null);
				if (
					!cached ||
					run !== activationRun ||
					invalidatedCachedHouseholds.has(cached.activeHousehold.id)
				)
					return false;

				try {
					const opened = await openSessionResource(cached);
					return await publishOpened(opened, cached, run, {
						startSync: false,
						shouldPublish: () =>
							!freshPublished &&
							!invalidatedCachedHouseholds.has(cached.activeHousehold.id),
					});
				} catch {
					return false;
				}
			})();

			if (!activation.authReady) {
				await cachedAttempt;
				return;
			}

			if (!activation.signedIn) {
				const publishedCached = await cachedAttempt;
				if (!publishedCached && run === activationRun) {
					await closeActiveResource().catch((error) => {
						logger.error("active Household resource close failed", {
							error: asError(error),
						});
					});
					publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
				}
				return;
			}

			try {
				const session = await householdSessionService.getHouseholdSession(
					activation.getToken,
				);
				if (run !== activationRun) return;
				const unauthorizedCached =
					await householdSessionService.readUnauthorizedCachedHouseholdSession(
						session,
					);
				if (run !== activationRun) return;
				if (unauthorizedCached) {
					invalidatedCachedHouseholds.add(
						unauthorizedCached.activeHousehold.id,
					);
					invalidatedUnauthorizedCached = true;
					publish({ status: "loading" });
					await closeUnauthorizedCachedResource(unauthorizedCached);
					if (run !== activationRun) return;
					await householdSessionService.deleteCachedHouseholdSessionLocalData(
						unauthorizedCached,
					);
					if (run !== activationRun) return;
					await householdSessionService.clearUnauthorizedCachedHouseholdSessionMetadata(
						unauthorizedCached,
						session,
					);
				}
				if (run !== activationRun) return;
				const previousView = previousViewFromSnapshot(snapshot);
				if (previousView) {
					publish({
						status: "loading",
						previous: previousView,
						refreshingSession: true,
					});
				}
				const opened = await openSessionResource(session);
				if (run !== activationRun) {
					await closeResource(opened.resource).catch(() => undefined);
					return;
				}
				await saveFreshSessionIfCurrent(session, run);
				if (run !== activationRun) {
					await closeResource(opened.resource).catch(() => undefined);
					return;
				}
				await publishOpened(opened, session, run, {
					startSync: true,
					onPublished: () => {
						freshPublished = true;
					},
				});
			} catch (error) {
				logger.error("active Household activation failed", {
					error: asError(error),
				});
				const publishedCached = await cachedAttempt;
				if (publishedCached && run === activationRun) {
					const previousView = previousViewFromSnapshot(snapshot);
					if (previousView && !invalidatedUnauthorizedCached) {
						publish({ status: "ready", view: previousView });
					} else {
						publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
					}
				} else if (!publishedCached && run === activationRun) {
					const previousView = previousViewFromSnapshot(snapshot);
					if (previousView) {
						publish({ status: "ready", view: previousView });
						return;
					}
					await closeActiveResource().catch(() => undefined);
					publish({ status: "error", message: GENERIC_ERROR_MESSAGE });
				}
			}
		},

		async dispose() {
			activationRun += 1;
			publish({ status: "idle" });
			const results = await Promise.allSettled([
				closeOpeningResources(),
				closeActiveResource(),
			]);
			const rejected = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (rejected) {
				throw rejected.reason;
			}
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

function isUnauthorizedCachedSession(
	session: ActiveHouseholdSession,
	cached: CachedHouseholdSession,
): boolean {
	return (
		session.activeHousehold.id === cached.activeHousehold.id &&
		!("authToken" in session.householdDatabase)
	);
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

function activeMemberNameFromSession(session: ActiveHouseholdSession): string {
	return session.activeMember.displayName ?? session.user.email ?? "Member";
}

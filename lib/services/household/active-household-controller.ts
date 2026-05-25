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

type ActiveHouseholdAuthState = "unknown" | "signedOut" | "signedIn";

type ActiveHouseholdSession = HouseholdSession | CachedHouseholdSession;

type ActiveHouseholdResource = {
	dataSource: ActiveListDataSource;
	close: () => Promise<void>;
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
		await resource.close();
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

	async function createSessionResource(
		session: ActiveHouseholdSession,
	): Promise<ActiveHouseholdResource> {
		let rawDataSource: ActiveListDataSource | null = null;
		try {
			rawDataSource = createCurrentListDataSource({
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
			return {
				dataSource,
				close: () => lease.retireAndClose({ stopSync: syncCoordinator.stop }),
				syncCoordinator,
			};
		} catch (error) {
			await rawDataSource?.close().catch(() => undefined);
			throw error;
		}
	}

	async function openSessionResource(
		session: ActiveHouseholdSession,
	): Promise<OpenedActiveHouseholdResource> {
		const resource = await createSessionResource(session);
		const dataSource = resource.dataSource;
		const syncCoordinator = resource.syncCoordinator;
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
			onDiscardCloseError?: (error: unknown) => void;
		},
	): Promise<boolean> {
		if (run !== activationRun || options.shouldPublish?.() === false) {
			await closeResource(opened.resource).catch((error) => {
				options.onDiscardCloseError?.(error);
			});
			return false;
		}

		const previousResource = publishResource(opened.resource, session);
		publish({ status: "ready", view: opened.view });
		options.onPublished?.();
		if (options.startSync) {
			opened.view.currentList.syncCoordinator.start();
		}

		if (previousResource) {
			const closePreviousResource = closeResource(previousResource);
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
					const opened = await openSessionResource(cached);
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
		await closeActiveResource().catch((error) => {
			logger.error("active Household resource close failed", {
				error: asError(error),
			});
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
		const discardedCached =
			await householdSessionService.discardUnauthorizedCachedHouseholdSession(
				freshSession,
				{
					beforeDeleteLocalData: async (cached) => {
						cachedAttempt.invalidateHousehold(cached);
						publish({ status: "loading" });
						await closeUnauthorizedCachedResource(cached);
						await cachedAttempt.promise;
						cachedAttempt.throwDiscardCloseError();
					},
					shouldContinue: run.isCurrent,
				},
			);
		return Boolean(discardedCached);
	}

	async function publishFreshSessionForRun(
		session: HouseholdSession,
		run: ActivationRunGuard,
		cachedAttempt: CachedActivationAttempt,
	) {
		publishLoadingFromCurrentView();
		const opened = await openSessionResource(session);
		if (!run.isCurrent()) {
			await closeResource(opened.resource).catch(() => undefined);
			return;
		}

		await saveFreshSessionIfCurrent(session, run.id);
		if (!run.isCurrent()) {
			await closeResource(opened.resource).catch(() => undefined);
			return;
		}

		await publishOpened(opened, session, run.id, {
			startSync: true,
			onPublished: cachedAttempt.markFreshPublished,
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
			await closeActiveResource().catch(() => undefined);
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

function activeHouseholdAuthStateFromActivation(
	activation: ActiveHouseholdActivation,
): ActiveHouseholdAuthState {
	if (!activation.authReady) return "unknown";
	return activation.signedIn ? "signedIn" : "signedOut";
}

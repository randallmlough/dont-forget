import type { Logger } from "@/lib/logger";
import type { SyncCoordinator } from "@/lib/services/sync";
import type { SessionBootstrap } from "./bootstrap";
import type { CachedSessionBootstrap } from "./cache";
import {
	createSessionResourceLease,
	staleAuthenticatedAppSessionResourceError,
} from "./resource-lease";
import type {
	SessionDataServices,
	SessionDataServicesConfig,
} from "./services";

export type SessionResourceBootstrap =
	| SessionBootstrap
	| CachedSessionBootstrap;

export type SessionResource = {
	lists: SessionDataServices["lists"];
	items: SessionDataServices["items"];
	close: (options?: { waitForDrain?: boolean }) => Promise<void>;
	syncCoordinator: SyncCoordinator;
};

export type OpenedSessionResource = {
	resource: SessionResource;
	resourceKey: string;
};

export type PublishOpenedSessionResourceOptions = {
	startSync: boolean;
	shouldPublish?: () => boolean;
	publish: (opened: OpenedSessionResource) => void;
	onPublished?: () => void;
	onDiscardCloseError?: (error: unknown) => void;
};

export type CreateSessionDataServices = (
	config: SessionDataServicesConfig,
) => Promise<SessionDataServices>;

export type CreateSyncCoordinator = (config: {
	syncAuthorized: boolean;
	sync: SessionDataServices["sync"];
	logger: Logger;
}) => SyncCoordinator;

type OpeningSessionResource = {
	session: SessionResourceBootstrap;
	resource?: SessionResource;
	resourcePromise: Promise<SessionResource>;
	cancelRequested: boolean;
	closePromise?: Promise<void>;
};

export type SessionResourceManager = {
	closeActiveResource: () => Promise<void>;
	closeOpeningResources: () => Promise<void>;
	closeUnauthorizedCachedResource: (
		cached: CachedSessionBootstrap,
	) => Promise<void>;
	openSessionResource: (
		session: SessionResourceBootstrap,
	) => Promise<OpenedSessionResource>;
	publishOpenedResource: (
		opened: OpenedSessionResource,
		session: SessionResourceBootstrap,
		options: PublishOpenedSessionResourceOptions,
	) => Promise<boolean>;
	getHouseholdIds: () => string[];
};

export type SessionResourceManagerDeps = {
	createDataServices: CreateSessionDataServices;
	createSyncCoordinator: CreateSyncCoordinator;
	logger: Logger;
};

export function createSessionResourceManager(
	deps: SessionResourceManagerDeps,
): SessionResourceManager {
	const { createDataServices, createSyncCoordinator, logger } = deps;
	let activeResource: SessionResource | null = null;
	let activeResourceSession: SessionResourceBootstrap | null = null;
	const openingResources = new Set<OpeningSessionResource>();
	let nextResourceVersion = 1;

	async function closeResource(
		resource: SessionResource,
		options?: { waitForDrain?: boolean },
	) {
		await resource.close(options);
	}

	function replaceActiveResource(
		resource: SessionResource,
		session: SessionResourceBootstrap,
	): SessionResource | null {
		const previousResource = activeResource;
		activeResource = resource;
		activeResourceSession = session;
		return previousResource && previousResource !== resource
			? previousResource
			: null;
	}

	function getHouseholdIds(): string[] {
		return Array.from(
			new Set([
				...(activeResourceSession
					? [activeResourceSession.activeHousehold.id]
					: []),
				...Array.from(
					openingResources,
					(opening) => opening.session.activeHousehold.id,
				),
			]),
		);
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
		session: SessionResourceBootstrap,
	): Promise<SessionResource> {
		let dataServices: SessionDataServices | null = null;
		try {
			const householdLogger = logger.with({
				household_id: session.activeHousehold.id,
			});
			const openedDataServices = await createDataServices({
				householdId: session.activeHousehold.id,
				userId: session.user.id,
				database: session.householdDatabase,
				logger: householdLogger,
			});
			dataServices = openedDataServices;
			const lease = createSessionResourceLease({
				lists: openedDataServices.lists,
				items: openedDataServices.items,
				sync: openedDataServices.sync,
			});
			const syncCoordinator = createSyncCoordinator({
				syncAuthorized: openedDataServices.syncAuthorized,
				sync: lease.services.sync,
				logger: householdLogger,
			});
			return {
				lists: lease.services.lists,
				items: lease.services.items,
				close: (options) =>
					lease.retireAndClose({
						close: openedDataServices.close,
						stopSync: syncCoordinator.stop,
						waitForDrain: options?.waitForDrain,
					}),
				syncCoordinator,
			};
		} catch (error) {
			await dataServices?.close().catch(() => undefined);
			throw error;
		}
	}

	async function openSessionResource(
		session: SessionResourceBootstrap,
	): Promise<OpenedSessionResource> {
		const opening: OpeningSessionResource = {
			session,
			resourcePromise: createSessionResource(session),
			cancelRequested: false,
		};
		openingResources.add(opening);

		try {
			const resource = await opening.resourcePromise;
			opening.resource = resource;
			if (opening.cancelRequested) {
				await closeOpeningResource(opening);
				throw staleAuthenticatedAppSessionResourceError();
			}
			const resourceKey = `authenticated-app-session:${nextResourceVersion}`;
			nextResourceVersion += 1;
			return {
				resource,
				resourceKey,
			};
		} catch (error) {
			if (opening.resource && !opening.closePromise) {
				await closeResource(opening.resource).catch(() => undefined);
			}
			throw error;
		} finally {
			openingResources.delete(opening);
		}
	}

	async function publishOpenedResource(
		opened: OpenedSessionResource,
		session: SessionResourceBootstrap,
		options: PublishOpenedSessionResourceOptions,
	): Promise<boolean> {
		if (options.shouldPublish?.() === false) {
			await closeResource(opened.resource).catch((error) => {
				options.onDiscardCloseError?.(error);
			});
			return false;
		}

		const previousResource = replaceActiveResource(opened.resource, session);
		options.publish(opened);
		options.onPublished?.();
		if (options.startSync) {
			opened.resource.syncCoordinator.start();
		}

		if (previousResource) {
			const closePreviousResource = closeResource(previousResource);
			await Promise.resolve();
			await closePreviousResource;
		}
		return true;
	}

	async function closeUnauthorizedCachedResource(
		cached: CachedSessionBootstrap,
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

	function closeOpeningResource(opening: OpeningSessionResource) {
		opening.cancelRequested = true;
		opening.closePromise ??= opening.resource
			? closeResource(opening.resource, { waitForDrain: false })
			: opening.resourcePromise.then(
					(resource) => {
						opening.resource = resource;
						return closeResource(resource, { waitForDrain: false });
					},
					() => undefined,
				);
		return opening.closePromise;
	}

	return {
		closeActiveResource,
		closeOpeningResources,
		closeUnauthorizedCachedResource,
		getHouseholdIds,
		openSessionResource,
		publishOpenedResource,
	};
}

function isUnauthorizedCachedSession(
	session: SessionResourceBootstrap,
	cached: CachedSessionBootstrap,
): boolean {
	return (
		session.activeHousehold.id === cached.activeHousehold.id &&
		!("authToken" in session.householdDatabase)
	);
}

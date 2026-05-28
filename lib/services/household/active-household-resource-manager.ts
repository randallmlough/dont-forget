import type { Logger } from "@/lib/logger";
import type { SyncCoordinator } from "@/lib/services/sync";
import type {
	ActiveHouseholdDataServices,
	ActiveHouseholdDataServicesConfig,
} from "./active-household-data-services";
import {
	createActiveHouseholdResourceLease,
	staleActiveHouseholdResourceError,
} from "./active-household-resource-lease";
import type {
	CachedHouseholdSession,
	HouseholdSession,
} from "./household-session-service";

export type ActiveHouseholdSession = HouseholdSession | CachedHouseholdSession;

export type ActiveHouseholdResource = {
	listService: ActiveHouseholdDataServices["listService"];
	itemService: ActiveHouseholdDataServices["itemService"];
	close: (options?: { waitForDrain?: boolean }) => Promise<void>;
	syncCoordinator: SyncCoordinator;
};

export type OpenedActiveHouseholdResource = {
	resource: ActiveHouseholdResource;
	resourceKey: string;
};

export type CreateActiveHouseholdDataServices = (
	config: ActiveHouseholdDataServicesConfig,
) => ActiveHouseholdDataServices;

export type CreateSyncCoordinator = (config: {
	syncAuthorized: boolean;
	sync: ActiveHouseholdDataServices["sync"];
	logger: Logger;
}) => SyncCoordinator;

type OpeningActiveHouseholdResource = {
	session: ActiveHouseholdSession;
	resource: ActiveHouseholdResource;
	closePromise?: Promise<void>;
};

export type ActiveHouseholdResourceManager = {
	closeActiveResource: () => Promise<void>;
	closeOpeningResources: () => Promise<void>;
	closeResource: (resource: ActiveHouseholdResource) => Promise<void>;
	closeUnauthorizedCachedResource: (
		cached: CachedHouseholdSession,
	) => Promise<void>;
	openSessionResource: (
		session: ActiveHouseholdSession,
	) => Promise<OpenedActiveHouseholdResource>;
	replaceActiveResource: (
		resource: ActiveHouseholdResource,
		session: ActiveHouseholdSession,
	) => ActiveHouseholdResource | null;
	getHouseholdIds: () => string[];
};

export type ActiveHouseholdResourceManagerDeps = {
	createDataServices: CreateActiveHouseholdDataServices;
	createSyncCoordinator: CreateSyncCoordinator;
	logger: Logger;
};

export function createActiveHouseholdResourceManager(
	deps: ActiveHouseholdResourceManagerDeps,
): ActiveHouseholdResourceManager {
	const { createDataServices, createSyncCoordinator, logger } = deps;
	let activeResource: ActiveHouseholdResource | null = null;
	let activeResourceSession: ActiveHouseholdSession | null = null;
	const openingResources = new Set<OpeningActiveHouseholdResource>();
	let nextResourceVersion = 1;

	async function closeResource(
		resource: ActiveHouseholdResource,
		options?: { waitForDrain?: boolean },
	) {
		await resource.close(options);
	}

	function replaceActiveResource(
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
		session: ActiveHouseholdSession,
	): Promise<ActiveHouseholdResource> {
		let dataServices: ActiveHouseholdDataServices | null = null;
		try {
			const householdLogger = logger.with({
				household_id: session.activeHousehold.id,
			});
			const openedDataServices = createDataServices({
				householdId: session.activeHousehold.id,
				database: session.householdDatabase,
				logger: householdLogger,
			});
			dataServices = openedDataServices;
			const lease = createActiveHouseholdResourceLease({
				listService: openedDataServices.listService,
				itemService: openedDataServices.itemService,
				sync: openedDataServices.sync,
			});
			const syncCoordinator = createSyncCoordinator({
				syncAuthorized: openedDataServices.syncAuthorized,
				sync: lease.services.sync,
				logger: householdLogger,
			});
			return {
				listService: lease.services.listService,
				itemService: lease.services.itemService,
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
		session: ActiveHouseholdSession,
	): Promise<OpenedActiveHouseholdResource> {
		const resource = await createSessionResource(session);
		const opening: OpeningActiveHouseholdResource = { session, resource };
		openingResources.add(opening);

		try {
			if (opening.closePromise) {
				await opening.closePromise;
				throw staleActiveHouseholdResourceError();
			}
			const resourceKey = `active-household:${nextResourceVersion}`;
			nextResourceVersion += 1;
			return {
				resource,
				resourceKey,
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
		opening.closePromise ??= closeResource(opening.resource, {
			waitForDrain: false,
		});
		return opening.closePromise;
	}

	return {
		closeActiveResource,
		closeOpeningResources,
		closeResource,
		closeUnauthorizedCachedResource,
		getHouseholdIds,
		openSessionResource,
		replaceActiveResource,
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

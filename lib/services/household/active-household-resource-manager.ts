import type {
	ActiveListDataSource,
	ActiveListSyncCoordinator,
} from "@/components/active-list";
import type { Logger } from "@/lib/logger";
import type { ActiveHouseholdView } from "./active-household-controller";
import type { HouseholdCurrentListDataSourceConfig } from "./current-list-data-source";
import {
	createCurrentListResourceLease,
	staleCurrentListResourceError,
} from "./current-list-resource-lease";
import type {
	CachedHouseholdSession,
	HouseholdSession,
} from "./household-session-service";

export type ActiveHouseholdSession = HouseholdSession | CachedHouseholdSession;

export type ActiveHouseholdResource = {
	dataSource: ActiveListDataSource;
	close: () => Promise<void>;
	syncCoordinator: ActiveListSyncCoordinator;
};

export type OpenedActiveHouseholdResource = {
	resource: ActiveHouseholdResource;
	view: ActiveHouseholdView;
};

export type CreateCurrentListDataSource = (
	config: HouseholdCurrentListDataSourceConfig,
) => ActiveListDataSource;

export type CreateSyncCoordinator = (config: {
	syncAuthorized: boolean;
	sync: ActiveListDataSource["sync"];
	logger: Logger;
}) => ActiveListSyncCoordinator;

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
};

export type ActiveHouseholdResourceManagerDeps = {
	createCurrentListDataSource: CreateCurrentListDataSource;
	createSyncCoordinator: CreateSyncCoordinator;
	logger: Logger;
};

export function createActiveHouseholdResourceManager(
	deps: ActiveHouseholdResourceManagerDeps,
): ActiveHouseholdResourceManager {
	const { createCurrentListDataSource, createSyncCoordinator, logger } = deps;
	let activeResource: ActiveHouseholdResource | null = null;
	let activeResourceSession: ActiveHouseholdSession | null = null;
	const openingResources = new Set<OpeningActiveHouseholdResource>();
	let nextResourceVersion = 1;

	async function closeResource(resource: ActiveHouseholdResource) {
		await resource.close();
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
			const householdLogger = logger.with({
				household_id: session.activeHousehold.id,
			});
			rawDataSource = createCurrentListDataSource({
				household: session.activeHousehold,
				activeMember: session.activeMember,
				list: session.activeList,
				currentUser: session.user,
				members: session.members,
				database: session.householdDatabase,
				logger: householdLogger,
			});
			const lease = createCurrentListResourceLease(rawDataSource);
			const dataSource = lease.dataSource;
			const syncCoordinator = createSyncCoordinator({
				syncAuthorized: dataSource.syncAuthorized,
				sync: dataSource.sync,
				logger: householdLogger,
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

	return {
		closeActiveResource,
		closeOpeningResources,
		closeResource,
		closeUnauthorizedCachedResource,
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

function activeMemberNameFromSession(session: ActiveHouseholdSession): string {
	return session.activeMember.displayName ?? session.user.email ?? "Member";
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { deleteLocalHouseholdStoreData } from "@/db/household-store";
import { track } from "@/lib/analytics";
import { bootstrapResponseSchema } from "@/lib/bootstrap";
import type { ServiceAnalytics } from "@/lib/services/analytics";
import { type SessionBootstrap, sessionAnalyticsProperties } from "./bootstrap";

export const SESSION_CACHE_KEY = "dont-forget:authenticated-app-session:v1";
const SIGNED_OUT_LOCAL_DATA_DELETION_KEY =
	"dont-forget:signed-out-local-household-deletions:v1";

const cachedSessionBootstrapSchema = bootstrapResponseSchema
	.omit({ householdDatabase: true })
	.extend({
		householdDatabase: z.object({
			url: z.string(),
			expiresAt: z.number(),
		}),
		initializedAt: z.number(),
	});

export type CachedSessionBootstrap = z.infer<
	typeof cachedSessionBootstrapSchema
>;

export type SessionCacheStorage = Pick<
	typeof AsyncStorage,
	"getItem" | "setItem" | "removeItem"
>;

export type SessionCache = {
	save: (session: SessionBootstrap) => Promise<CachedSessionBootstrap>;
	read: () => Promise<CachedSessionBootstrap | null>;
	readUnauthorized: (
		freshSession: SessionBootstrap,
	) => Promise<CachedSessionBootstrap | null>;
	clearUnauthorizedMetadata: (
		cached: CachedSessionBootstrap,
		freshSession: SessionBootstrap,
	) => Promise<void>;
	clearSignedOutData: (householdIds?: string[]) => Promise<void>;
	deleteLocalData: (
		cached: CachedSessionBootstrap,
		freshSession?: SessionBootstrap,
	) => Promise<void>;
};

export type SessionCacheDeps = {
	storage?: SessionCacheStorage;
	analytics?: ServiceAnalytics;
	deleteLocalHouseholdStoreData?: typeof deleteLocalHouseholdStoreData;
};

export function createSessionCache(deps: SessionCacheDeps = {}): SessionCache {
	const storage = deps.storage ?? AsyncStorage;
	const analytics = deps.analytics ?? { track };
	const deleteLocalDataForHousehold =
		deps.deleteLocalHouseholdStoreData ?? deleteLocalHouseholdStoreData;

	async function read(): Promise<CachedSessionBootstrap | null> {
		await drainPendingSignedOutLocalDataDeletions().catch(() => undefined);
		const raw = await storage.getItem(SESSION_CACHE_KEY);
		if (!raw) return null;

		try {
			return cachedSessionBootstrapSchema.parse(JSON.parse(raw));
		} catch {
			return null;
		}
	}

	async function clearCachedMetadata(): Promise<void> {
		await storage.removeItem(SESSION_CACHE_KEY);
	}

	async function readPendingSignedOutLocalDataDeletions(): Promise<string[]> {
		const raw = await storage.getItem(SIGNED_OUT_LOCAL_DATA_DELETION_KEY);
		if (!raw) return [];

		try {
			return z.array(z.string()).parse(JSON.parse(raw));
		} catch {
			return [];
		}
	}

	async function savePendingSignedOutLocalDataDeletions(
		householdIds: string[],
	): Promise<void> {
		const uniqueHouseholdIds = Array.from(new Set(householdIds));
		if (uniqueHouseholdIds.length === 0) {
			await storage.removeItem(SIGNED_OUT_LOCAL_DATA_DELETION_KEY);
			return;
		}

		await storage.setItem(
			SIGNED_OUT_LOCAL_DATA_DELETION_KEY,
			JSON.stringify(uniqueHouseholdIds),
		);
	}

	async function drainPendingSignedOutLocalDataDeletions(
		householdIds: string[] = [],
	): Promise<void> {
		const pendingHouseholdIds = await readPendingSignedOutLocalDataDeletions();
		if (pendingHouseholdIds.length === 0 && householdIds.length === 0) return;
		const remainingHouseholdIds: string[] = [];
		let cleanupError: unknown = null;

		for (const householdId of new Set([
			...pendingHouseholdIds,
			...householdIds,
		])) {
			try {
				await deleteLocalDataForHousehold(householdId);
			} catch (error) {
				remainingHouseholdIds.push(householdId);
				cleanupError ??= error;
			}
		}

		await savePendingSignedOutLocalDataDeletions(remainingHouseholdIds);
		if (cleanupError) throw cleanupError;
	}

	async function deleteLocalData(
		cached: CachedSessionBootstrap,
		freshSession?: SessionBootstrap,
	): Promise<void> {
		await drainPendingSignedOutLocalDataDeletions(
			unauthorizedCachedHouseholdIds(cached, freshSession),
		);
	}

	async function clearUnauthorizedMetadata(
		cached: CachedSessionBootstrap,
		freshSession: SessionBootstrap,
	): Promise<void> {
		await clearCachedMetadata();
		analytics.track("authenticated_app_session_cache_invalidated", {
			household_id: cached.activeHousehold.id,
			fresh_household_id: freshSession.activeHousehold.id,
			reason: "unauthorized",
		});
	}

	async function readUnauthorized(
		freshSession: SessionBootstrap,
	): Promise<CachedSessionBootstrap | null> {
		const cached = await read();
		if (!cached || cachedSessionIsStillAuthorized(cached, freshSession)) {
			return null;
		}

		return cached;
	}

	return {
		async save(session) {
			const previous = await read();
			const cached = cachedSessionBootstrapFromSession(session);
			let cleanupError: unknown = null;
			try {
				await drainPendingSignedOutLocalDataDeletions(
					droppedAssociatedHouseholdIds(previous, cached),
				);
			} catch (error) {
				cleanupError = error;
			}
			await storage.setItem(SESSION_CACHE_KEY, JSON.stringify(cached));
			analytics.track(
				"authenticated_app_session_cached",
				sessionAnalyticsProperties(session),
			);

			if (cleanupError) throw cleanupError;
			return cached;
		},

		read,

		readUnauthorized,

		clearUnauthorizedMetadata,

		async clearSignedOutData(householdIds = []) {
			const cached = await read();
			const signedOutHouseholdIds = [...householdIds];

			if (cached) {
				signedOutHouseholdIds.push(
					...cached.households.map((household) => household.id),
				);
			}

			let cleanupError: unknown = null;
			try {
				await drainPendingSignedOutLocalDataDeletions(signedOutHouseholdIds);
			} catch (error) {
				cleanupError = error;
			}
			await clearCachedMetadata();
			if (cleanupError) throw cleanupError;
		},

		deleteLocalData,
	};
}

const defaultSessionCache = createSessionCache();

export async function hasCachedAuthenticatedAppSession(): Promise<boolean> {
	return (await defaultSessionCache.read()) !== null;
}

export function clearSignedOutSessionData(
	householdIds?: string[],
): Promise<void> {
	return defaultSessionCache.clearSignedOutData(householdIds);
}

function cachedSessionIsStillAuthorized(
	cached: CachedSessionBootstrap,
	freshSession: SessionBootstrap,
): boolean {
	return (
		cached.user.id === freshSession.user.id &&
		freshSession.households.some(
			(household) => household.id === cached.activeHousehold.id,
		)
	);
}

function cachedSessionBootstrapFromSession(
	session: SessionBootstrap,
): CachedSessionBootstrap {
	const { householdDatabase: _householdDatabase, ...metadata } = session;

	return cachedSessionBootstrapSchema.parse({
		...metadata,
		householdDatabase: {
			url: session.householdDatabase.url,
			expiresAt: session.householdDatabase.expiresAt,
		},
		initializedAt: Date.now(),
	});
}

function droppedAssociatedHouseholdIds(
	previous: CachedSessionBootstrap | null,
	next: CachedSessionBootstrap,
): string[] {
	if (!previous) return [];

	const nextHouseholdIds = new Set(
		next.households.map((household) => household.id),
	);
	return previous.households
		.map((household) => household.id)
		.filter((householdId) => !nextHouseholdIds.has(householdId));
}

function unauthorizedCachedHouseholdIds(
	cached: CachedSessionBootstrap,
	freshSession?: SessionBootstrap,
): string[] {
	if (!freshSession) {
		return cached.households.map((household) => household.id);
	}
	if (cached.user.id !== freshSession.user.id) {
		return cached.households.map((household) => household.id);
	}

	const freshHouseholdIds = new Set(
		freshSession.households.map((household) => household.id),
	);
	return cached.households
		.map((household) => household.id)
		.filter((householdId) => !freshHouseholdIds.has(householdId));
}

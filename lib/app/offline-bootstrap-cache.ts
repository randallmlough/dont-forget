import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BootstrapResponse } from "@/lib/bootstrap";
import { deleteLocalHouseholdStoreData } from "@/lib/services/household";

export const OFFLINE_BOOTSTRAP_CACHE_KEY = "dont-forget:offline-bootstrap:v1";

export type CachedBootstrapMetadata = Omit<
	BootstrapResponse,
	"householdDatabase"
> & {
	householdDatabase: {
		url: string;
		expiresAt: number;
	};
	initializedAt: number;
};

export type OfflineBootstrapStorage = Pick<
	typeof AsyncStorage,
	"getItem" | "setItem" | "removeItem"
>;

type CacheOptions = {
	storage?: OfflineBootstrapStorage;
};

type SaveCacheOptions = CacheOptions & {
	now?: () => number;
};

type CleanupCacheOptions = CacheOptions & {
	deleteHouseholdData?: (householdId: string) => Promise<void>;
};

export async function saveCachedBootstrapMetadata(
	bootstrap: BootstrapResponse,
	options: SaveCacheOptions = {},
): Promise<CachedBootstrapMetadata> {
	const metadata = cachedMetadataFromBootstrap(
		bootstrap,
		options.now ?? Date.now,
	);
	await storageFrom(options).setItem(
		OFFLINE_BOOTSTRAP_CACHE_KEY,
		JSON.stringify(metadata),
	);

	return metadata;
}

export async function readCachedBootstrapMetadata(
	options: CacheOptions = {},
): Promise<CachedBootstrapMetadata | null> {
	const raw = await storageFrom(options).getItem(OFFLINE_BOOTSTRAP_CACHE_KEY);
	if (!raw) return null;

	try {
		return stripHouseholdDatabaseToken(
			JSON.parse(raw) as CachedBootstrapMetadata,
		);
	} catch {
		return null;
	}
}

export async function clearCachedBootstrapMetadata(
	options: CacheOptions = {},
): Promise<void> {
	await storageFrom(options).removeItem(OFFLINE_BOOTSTRAP_CACHE_KEY);
}

export async function discardCachedBootstrapMetadataIfUnauthorized(
	freshBootstrap: BootstrapResponse,
	options: CleanupCacheOptions = {},
): Promise<CachedBootstrapMetadata | null> {
	const cached = await readCachedBootstrapMetadata(options);
	if (!cached || cachedBootstrapIsStillAuthorized(cached, freshBootstrap))
		return null;

	await deleteHouseholdDataFrom(options)(cached.activeHousehold.id);
	await clearCachedBootstrapMetadata(options);

	return cached;
}

export async function clearCachedHouseholdSession(
	options: CleanupCacheOptions = {},
): Promise<void> {
	const cached = await readCachedBootstrapMetadata(options);
	if (cached) {
		await deleteHouseholdDataFrom(options)(cached.activeHousehold.id);
	}

	await clearCachedBootstrapMetadata(options);
}

function cachedBootstrapIsStillAuthorized(
	cached: CachedBootstrapMetadata,
	freshBootstrap: BootstrapResponse,
): boolean {
	return (
		cached.user.id === freshBootstrap.user.id &&
		cached.activeHousehold.id === freshBootstrap.activeHousehold.id
	);
}

function cachedMetadataFromBootstrap(
	bootstrap: BootstrapResponse,
	now: () => number,
): CachedBootstrapMetadata {
	const { householdDatabase: _householdDatabase, ...metadata } = bootstrap;

	return stripHouseholdDatabaseToken({
		...metadata,
		householdDatabase: {
			url: bootstrap.householdDatabase.url,
			expiresAt: bootstrap.householdDatabase.expiresAt,
		},
		initializedAt: now(),
	});
}

function stripHouseholdDatabaseToken(
	metadata: CachedBootstrapMetadata,
): CachedBootstrapMetadata {
	return {
		user: metadata.user,
		activeHousehold: metadata.activeHousehold,
		activeMember: metadata.activeMember,
		activeList: metadata.activeList,
		members: metadata.members,
		householdDatabase: {
			url: metadata.householdDatabase.url,
			expiresAt: metadata.householdDatabase.expiresAt,
		},
		initializedAt: metadata.initializedAt,
	};
}

function storageFrom(options: CacheOptions): OfflineBootstrapStorage {
	return options.storage ?? AsyncStorage;
}

function deleteHouseholdDataFrom(
	options: CleanupCacheOptions,
): (householdId: string) => Promise<void> {
	return options.deleteHouseholdData ?? deleteLocalHouseholdStoreData;
}

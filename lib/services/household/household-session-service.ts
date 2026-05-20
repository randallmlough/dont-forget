import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { z } from "zod";
import { track } from "@/lib/analytics";
import {
	BOOTSTRAP_API_PATH,
	type BootstrapResponse,
	bootstrapResponseSchema,
} from "@/lib/bootstrap";
import { deleteLocalHouseholdStoreData } from "./household-store";

export const HOUSEHOLD_SESSION_CACHE_KEY = "dont-forget:household-session:v1";

export type HouseholdSession = BootstrapResponse;

const cachedHouseholdSessionSchema = bootstrapResponseSchema
	.omit({ householdDatabase: true })
	.extend({
		householdDatabase: z.object({
			url: z.string(),
			expiresAt: z.number(),
		}),
		initializedAt: z.number(),
	});

export type CachedHouseholdSession = z.infer<
	typeof cachedHouseholdSessionSchema
>;

export type HouseholdSessionStorage = Pick<
	typeof AsyncStorage,
	"getItem" | "setItem" | "removeItem"
>;

export type GetHouseholdSessionToken = () => Promise<string | null>;

type HouseholdSessionFetch = typeof globalThis.fetch;

type HouseholdSessionServiceAnalytics = {
	track: typeof track;
};

export type HouseholdSessionService = {
	getHouseholdSession: (
		getToken: GetHouseholdSessionToken,
	) => Promise<HouseholdSession>;
	saveCachedHouseholdSession: (
		session: HouseholdSession,
	) => Promise<CachedHouseholdSession>;
	readCachedHouseholdSession: () => Promise<CachedHouseholdSession | null>;
	discardCachedHouseholdSessionIfUnauthorized: (
		freshSession: HouseholdSession,
	) => Promise<CachedHouseholdSession | null>;
	clearCachedHouseholdSession: () => Promise<void>;
};

export type HouseholdSessionServiceDeps = {
	storage?: HouseholdSessionStorage;
	fetch?: HouseholdSessionFetch;
	apiBaseUrl?: () => string;
	analytics?: HouseholdSessionServiceAnalytics;
};

export function createHouseholdSessionService(
	deps: HouseholdSessionServiceDeps = {},
): HouseholdSessionService {
	const storage = deps.storage ?? AsyncStorage;
	const fetcher = deps.fetch ?? globalThis.fetch;
	const apiBaseUrl = deps.apiBaseUrl ?? readApiBaseUrl;
	const analytics = deps.analytics ?? { track };

	async function readCachedHouseholdSession(): Promise<CachedHouseholdSession | null> {
		const raw = await storage.getItem(HOUSEHOLD_SESSION_CACHE_KEY);
		if (!raw) return null;

		try {
			return cachedHouseholdSessionSchema.parse(JSON.parse(raw));
		} catch {
			return null;
		}
	}

	async function clearCachedSessionMetadata(): Promise<void> {
		await storage.removeItem(HOUSEHOLD_SESSION_CACHE_KEY);
	}

	return {
		async getHouseholdSession(getToken) {
			const token = await getToken();
			if (!token) {
				throw new Error("Missing Clerk session token");
			}

			const response = await fetcher(
				`${apiBaseUrl().replace(/\/$/, "")}${BOOTSTRAP_API_PATH}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);

			if (!response.ok) {
				throw new Error("Unable to prepare your Household. Please try again.");
			}

			const payload: unknown = await response.json();
			const session = bootstrapResponseSchema.parse(payload);
			analytics.track("household_session_loaded", {
				...householdSessionAnalyticsProperties(session),
				source: "online",
			});

			return session;
		},

		async saveCachedHouseholdSession(session) {
			const cached = cachedHouseholdSessionFromSession(session);
			await storage.setItem(
				HOUSEHOLD_SESSION_CACHE_KEY,
				JSON.stringify(cached),
			);
			analytics.track(
				"household_session_cached",
				householdSessionAnalyticsProperties(session),
			);

			return cached;
		},

		readCachedHouseholdSession,

		async discardCachedHouseholdSessionIfUnauthorized(freshSession) {
			const cached = await readCachedHouseholdSession();
			if (
				!cached ||
				cachedHouseholdSessionIsStillAuthorized(cached, freshSession)
			) {
				return null;
			}

			await deleteLocalHouseholdStoreData(cached.activeHousehold.id);
			await clearCachedSessionMetadata();
			analytics.track("household_session_cache_invalidated", {
				household_id: cached.activeHousehold.id,
				fresh_household_id: freshSession.activeHousehold.id,
				reason: "unauthorized",
			});

			return cached;
		},

		async clearCachedHouseholdSession() {
			const cached = await readCachedHouseholdSession();
			if (cached) {
				await deleteLocalHouseholdStoreData(cached.activeHousehold.id);
			}

			await clearCachedSessionMetadata();
		},
	};
}

const defaultHouseholdSessionService = createHouseholdSessionService();

export function getHouseholdSession(
	getToken: GetHouseholdSessionToken,
): Promise<HouseholdSession> {
	return defaultHouseholdSessionService.getHouseholdSession(getToken);
}

export function saveCachedHouseholdSession(
	session: HouseholdSession,
): Promise<CachedHouseholdSession> {
	return defaultHouseholdSessionService.saveCachedHouseholdSession(session);
}

export function readCachedHouseholdSession(): Promise<CachedHouseholdSession | null> {
	return defaultHouseholdSessionService.readCachedHouseholdSession();
}

export function discardCachedHouseholdSessionIfUnauthorized(
	freshSession: HouseholdSession,
): Promise<CachedHouseholdSession | null> {
	return defaultHouseholdSessionService.discardCachedHouseholdSessionIfUnauthorized(
		freshSession,
	);
}

export function clearCachedHouseholdSession(): Promise<void> {
	return defaultHouseholdSessionService.clearCachedHouseholdSession();
}

function cachedHouseholdSessionIsStillAuthorized(
	cached: CachedHouseholdSession,
	freshSession: HouseholdSession,
): boolean {
	return (
		cached.user.id === freshSession.user.id &&
		cached.activeHousehold.id === freshSession.activeHousehold.id
	);
}

function cachedHouseholdSessionFromSession(
	session: HouseholdSession,
): CachedHouseholdSession {
	const { householdDatabase: _householdDatabase, ...metadata } = session;

	return cachedHouseholdSessionSchema.parse({
		...metadata,
		householdDatabase: {
			url: session.householdDatabase.url,
			expiresAt: session.householdDatabase.expiresAt,
		},
		initializedAt: Date.now(),
	});
}

function householdSessionAnalyticsProperties(session: HouseholdSession): {
	household_id: string;
	list_id: string;
	member_role: "owner" | "member";
	member_count: number;
} {
	return {
		household_id: session.activeHousehold.id,
		list_id: session.activeList.id,
		member_role: session.activeMember.role,
		member_count: session.members.length,
	};
}

function readApiBaseUrl(): string {
	const value = Constants.expoConfig?.extra?.apiBaseUrl;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
	}

	return value.replace(/\/$/, "");
}

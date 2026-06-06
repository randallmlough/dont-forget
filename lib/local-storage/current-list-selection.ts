import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

export type CurrentListSelectionStorage = Pick<
	typeof AsyncStorage,
	"getItem" | "setItem" | "removeItem"
>;

export type CurrentListSelectionScope = {
	userId: string;
	householdId: string;
};

export type CurrentListSelectionStore = {
	readSelection: (scope: CurrentListSelectionScope) => Promise<string | null>;
	writeSelection: (
		scope: CurrentListSelectionScope & { listId: string },
		options?: CurrentListSelectionWriteOptions,
	) => Promise<void>;
	clearSelection: (
		scope: CurrentListSelectionScope,
		options?: CurrentListSelectionWriteOptions,
	) => Promise<void>;
	clearSelectionsForUser: (userId: string) => Promise<void>;
	clearSignedOutSelectionsForUser: (userId: string) => Promise<void>;
	drainPendingSignedOutSelections: () => Promise<void>;
};

export type CurrentListSelectionWriteOptions = {
	shouldCommit?: () => boolean;
};

export type CurrentListSelectionStoreDeps = {
	storage?: CurrentListSelectionStorage;
};

const selectionMapSchema = z.record(z.string(), z.string());
const pendingSignedOutUserCleanupKey =
	"dont-forget:current-list-selection:signed-out-users:v1";
const pendingSignedOutUserIdsSchema = z.array(z.string());

export function createCurrentListSelectionStore(
	deps: CurrentListSelectionStoreDeps = {},
): CurrentListSelectionStore {
	const storage = deps.storage ?? AsyncStorage;
	const signedOutCleanupVersions = new Map<string, number>();

	async function readMap(
		userId: string,
	): Promise<Record<string, string> | null> {
		const raw = await storage.getItem(storageKey(userId));
		if (!raw) return {};

		try {
			return selectionMapSchema.parse(JSON.parse(raw));
		} catch {
			await storage.removeItem(storageKey(userId));
			return null;
		}
	}

	async function readPendingSignedOutUserIds(): Promise<string[]> {
		const raw = await storage.getItem(pendingSignedOutUserCleanupKey);
		if (!raw) return [];

		try {
			return pendingSignedOutUserIdsSchema.parse(JSON.parse(raw));
		} catch {
			return [];
		}
	}

	async function savePendingSignedOutUserIds(userIds: string[]) {
		const uniqueUserIds = Array.from(new Set(userIds));
		if (uniqueUserIds.length === 0) {
			await storage.removeItem(pendingSignedOutUserCleanupKey);
			return;
		}

		await storage.setItem(
			pendingSignedOutUserCleanupKey,
			JSON.stringify(uniqueUserIds),
		);
	}

	function cleanupVersionForUser(userId: string): number {
		return signedOutCleanupVersions.get(userId) ?? 0;
	}

	function invalidateUserWrites(userId: string) {
		signedOutCleanupVersions.set(userId, cleanupVersionForUser(userId) + 1);
	}

	function writeCanCommit(
		userId: string,
		cleanupVersion: number,
		options?: CurrentListSelectionWriteOptions,
	): boolean {
		return (
			cleanupVersionForUser(userId) === cleanupVersion &&
			(options?.shouldCommit?.() ?? true)
		);
	}

	async function drainPendingSignedOutUserCleanups(userIds: string[] = []) {
		const pendingUserIds = await readPendingSignedOutUserIds();
		if (pendingUserIds.length === 0 && userIds.length === 0) return;

		const remainingUserIds: string[] = [];
		let cleanupError: unknown = null;
		for (const userId of new Set([...pendingUserIds, ...userIds])) {
			invalidateUserWrites(userId);
			try {
				await storage.removeItem(storageKey(userId));
			} catch (error) {
				remainingUserIds.push(userId);
				cleanupError ??= error;
			}
		}

		await savePendingSignedOutUserIds(remainingUserIds);
		if (cleanupError) throw cleanupError;
	}

	return {
		async readSelection(scope) {
			const map = await readMap(scope.userId);
			return map?.[scope.householdId] ?? null;
		},

		async writeSelection(scope, options) {
			const cleanupVersion = cleanupVersionForUser(scope.userId);
			const map = (await readMap(scope.userId)) ?? {};
			if (!writeCanCommit(scope.userId, cleanupVersion, options)) return;

			const previousPayload =
				Object.keys(map).length > 0 ? JSON.stringify(map) : null;
			const nextPayload = JSON.stringify({
				...map,
				[scope.householdId]: scope.listId,
			});
			await storage.setItem(storageKey(scope.userId), nextPayload);
			if (!writeCanCommit(scope.userId, cleanupVersion, options)) {
				if ((await storage.getItem(storageKey(scope.userId))) === nextPayload) {
					if (cleanupVersionForUser(scope.userId) !== cleanupVersion) {
						await storage.removeItem(storageKey(scope.userId));
					} else if (previousPayload) {
						await storage.setItem(storageKey(scope.userId), previousPayload);
					} else {
						await storage.removeItem(storageKey(scope.userId));
					}
				}
			}
		},

		async clearSelection(scope, options) {
			const cleanupVersion = cleanupVersionForUser(scope.userId);
			const map = (await readMap(scope.userId)) ?? {};
			if (!writeCanCommit(scope.userId, cleanupVersion, options)) return;
			if (!(scope.householdId in map)) return;

			const previousPayload =
				Object.keys(map).length > 0 ? JSON.stringify(map) : null;
			const nextMap = { ...map };
			delete nextMap[scope.householdId];
			const nextPayload =
				Object.keys(nextMap).length > 0 ? JSON.stringify(nextMap) : null;
			if (nextPayload) {
				await storage.setItem(storageKey(scope.userId), nextPayload);
			} else {
				await storage.removeItem(storageKey(scope.userId));
			}
			if (!writeCanCommit(scope.userId, cleanupVersion, options)) {
				if ((await storage.getItem(storageKey(scope.userId))) === nextPayload) {
					if (cleanupVersionForUser(scope.userId) !== cleanupVersion) {
						await storage.removeItem(storageKey(scope.userId));
					} else if (previousPayload) {
						await storage.setItem(storageKey(scope.userId), previousPayload);
					} else {
						await storage.removeItem(storageKey(scope.userId));
					}
				}
			}
		},

		async clearSelectionsForUser(userId) {
			invalidateUserWrites(userId);
			await storage.removeItem(storageKey(userId));
		},

		async clearSignedOutSelectionsForUser(userId) {
			await drainPendingSignedOutUserCleanups([userId]);
		},

		async drainPendingSignedOutSelections() {
			await drainPendingSignedOutUserCleanups();
		},
	};
}

export const currentListSelectionStore = createCurrentListSelectionStore();

function storageKey(userId: string): string {
	return `dont-forget:current-list-selection:${userId}:v1`;
}

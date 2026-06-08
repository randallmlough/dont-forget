import AsyncStorage from "@react-native-async-storage/async-storage";

export type CurrentListSelectionMap = Record<string, string>;

export type CurrentListSelectionStorage = Pick<
	typeof AsyncStorage,
	"getItem" | "setItem" | "removeItem"
>;

export type CurrentListSelectionStore = {
	getCurrentListSelection: (
		userId: string,
		householdId: string,
	) => Promise<string | null>;
	setCurrentListSelection: (
		userId: string,
		householdId: string,
		listId: string,
	) => Promise<void>;
	clearCurrentListSelection: (
		userId: string,
		householdId: string,
	) => Promise<void>;
	clearUserCurrentListSelections: (userId: string) => Promise<void>;
};

export type CurrentListSelectionStoreDeps = {
	storage?: CurrentListSelectionStorage;
};

export function createCurrentListSelectionStore(
	deps: CurrentListSelectionStoreDeps = {},
): CurrentListSelectionStore {
	const storage = deps.storage ?? AsyncStorage;

	function storageKey(userId: string): string {
		return `dont-forget:current-list-selection:v1:${userId}`;
	}

	async function readMap(
		userId: string,
	): Promise<CurrentListSelectionMap | null> {
		const key = storageKey(userId);
		const raw = await storage.getItem(key);
		if (raw === null) return null;

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			await storage.removeItem(key);
			return null;
		}

		if (!isCurrentListSelectionMap(parsed)) {
			await storage.removeItem(key);
			return null;
		}

		return parsed;
	}

	return {
		async getCurrentListSelection(userId, householdId) {
			const selections = await readMap(userId);
			return selections?.[householdId] ?? null;
		},

		async setCurrentListSelection(userId, householdId, listId) {
			const selections = (await readMap(userId)) ?? {};
			selections[householdId] = listId;
			await storage.setItem(storageKey(userId), JSON.stringify(selections));
		},

		async clearCurrentListSelection(userId, householdId) {
			const selections = await readMap(userId);
			if (!selections || !(householdId in selections)) return;

			delete selections[householdId];
			const key = storageKey(userId);
			if (Object.keys(selections).length === 0) {
				await storage.removeItem(key);
				return;
			}

			await storage.setItem(key, JSON.stringify(selections));
		},

		async clearUserCurrentListSelections(userId) {
			await storage.removeItem(storageKey(userId));
		},
	};
}

const defaultCurrentListSelectionStore = createCurrentListSelectionStore();

export function getCurrentListSelection(
	userId: string,
	householdId: string,
): Promise<string | null> {
	return defaultCurrentListSelectionStore.getCurrentListSelection(
		userId,
		householdId,
	);
}

export function setCurrentListSelection(
	userId: string,
	householdId: string,
	listId: string,
): Promise<void> {
	return defaultCurrentListSelectionStore.setCurrentListSelection(
		userId,
		householdId,
		listId,
	);
}

export function clearCurrentListSelection(
	userId: string,
	householdId: string,
): Promise<void> {
	return defaultCurrentListSelectionStore.clearCurrentListSelection(
		userId,
		householdId,
	);
}

export function clearUserCurrentListSelections(userId: string): Promise<void> {
	return defaultCurrentListSelectionStore.clearUserCurrentListSelections(
		userId,
	);
}

function isCurrentListSelectionMap(
	value: unknown,
): value is CurrentListSelectionMap {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	return Object.values(value).every((listId) => typeof listId === "string");
}

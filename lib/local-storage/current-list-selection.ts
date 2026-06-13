import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

export type CurrentListSelectionMap = Record<string, string>;

const currentListSelectionMapSchema = z.record(z.string(), z.string());

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
	clearCurrentListSelectionIfMatches: (
		userId: string,
		householdId: string,
		listId: string,
	) => Promise<boolean>;
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

	async function readSelectionMap(
		userId: string,
	): Promise<CurrentListSelectionMap | null> {
		const raw = await storage.getItem(storageKey(userId));
		if (!raw) return null;

		try {
			return currentListSelectionMapSchema.parse(JSON.parse(raw));
		} catch {
			await storage.removeItem(storageKey(userId));
			return null;
		}
	}

	async function writeSelectionMap(
		userId: string,
		selections: CurrentListSelectionMap,
	): Promise<void> {
		if (Object.keys(selections).length === 0) {
			await storage.removeItem(storageKey(userId));
			return;
		}

		await storage.setItem(storageKey(userId), JSON.stringify(selections));
	}

	return {
		async getCurrentListSelection(userId, householdId) {
			const selections = await readSelectionMap(userId);
			return selections?.[householdId] ?? null;
		},

		async setCurrentListSelection(userId, householdId, listId) {
			const selections = (await readSelectionMap(userId)) ?? {};
			selections[householdId] = listId;
			await writeSelectionMap(userId, selections);
		},

		async clearCurrentListSelection(userId, householdId) {
			const selections = await readSelectionMap(userId);
			if (!selections || !(householdId in selections)) return;

			delete selections[householdId];
			await writeSelectionMap(userId, selections);
		},

		async clearCurrentListSelectionIfMatches(userId, householdId, listId) {
			const selections = await readSelectionMap(userId);
			if (!selections || selections[householdId] !== listId) return false;

			delete selections[householdId];
			await writeSelectionMap(userId, selections);
			return true;
		},

		async clearUserCurrentListSelections(userId) {
			await storage.removeItem(storageKey(userId));
		},
	};
}

const defaultCurrentListSelectionStore = createCurrentListSelectionStore();

export const getCurrentListSelection =
	defaultCurrentListSelectionStore.getCurrentListSelection;
export const setCurrentListSelection =
	defaultCurrentListSelectionStore.setCurrentListSelection;
export const clearCurrentListSelection =
	defaultCurrentListSelectionStore.clearCurrentListSelection;
export const clearCurrentListSelectionIfMatches =
	defaultCurrentListSelectionStore.clearCurrentListSelectionIfMatches;
export const clearUserCurrentListSelections =
	defaultCurrentListSelectionStore.clearUserCurrentListSelections;

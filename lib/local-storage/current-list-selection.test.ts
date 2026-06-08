import {
	type CurrentListSelectionStorage,
	createCurrentListSelectionStore,
} from "./current-list-selection";

describe("createCurrentListSelectionStore", () => {
	it("reads and writes the same user and Household selection", async () => {
		const store = createCurrentListSelectionStore({
			storage: memoryStorage(),
		});

		await store.setCurrentListSelection("usr_avery", "hh_home", "list_main");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_home"),
		).resolves.toBe("list_main");
	});

	it("keeps the same User's Household selections isolated", async () => {
		const store = createCurrentListSelectionStore({
			storage: memoryStorage(),
		});

		await store.setCurrentListSelection("usr_avery", "hh_home", "list_home");
		await store.setCurrentListSelection("usr_avery", "hh_cabin", "list_cabin");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_home"),
		).resolves.toBe("list_home");
		await expect(
			store.getCurrentListSelection("usr_avery", "hh_cabin"),
		).resolves.toBe("list_cabin");
	});

	it("keeps different Users' selections isolated for the same Household", async () => {
		const store = createCurrentListSelectionStore({
			storage: memoryStorage(),
		});

		await store.setCurrentListSelection("usr_avery", "hh_shared", "list_a");
		await store.setCurrentListSelection("usr_blake", "hh_shared", "list_b");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBe("list_a");
		await expect(
			store.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBe("list_b");
	});

	it("clears one Household selection while preserving the User's other Household entries", async () => {
		const store = createCurrentListSelectionStore({
			storage: memoryStorage(),
		});
		await store.setCurrentListSelection("usr_avery", "hh_home", "list_home");
		await store.setCurrentListSelection("usr_avery", "hh_cabin", "list_cabin");

		await store.clearCurrentListSelection("usr_avery", "hh_home");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_home"),
		).resolves.toBeNull();
		await expect(
			store.getCurrentListSelection("usr_avery", "hh_cabin"),
		).resolves.toBe("list_cabin");
	});

	it("clears one User's map while preserving another User's selections", async () => {
		const store = createCurrentListSelectionStore({
			storage: memoryStorage(),
		});
		await store.setCurrentListSelection("usr_avery", "hh_shared", "list_a");
		await store.setCurrentListSelection("usr_blake", "hh_shared", "list_b");

		await store.clearUserCurrentListSelections("usr_avery");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBeNull();
		await expect(
			store.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBe("list_b");
	});

	it("removes corrupt JSON and treats it as no selection", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });
		await store.setCurrentListSelection("usr_avery", "hh_home", "list_home");
		const key = onlyStorageKey(storage);
		await storage.setItem(key, "{");
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_home"),
		).resolves.toBeNull();

		expect(removeItem).toHaveBeenCalledWith(key);
		await expect(storage.getItem(key)).resolves.toBeNull();
	});

	it("removes invalid non-string map values and treats them as no selection", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });
		await store.setCurrentListSelection("usr_avery", "hh_home", "list_home");
		const key = onlyStorageKey(storage);
		await storage.setItem(key, JSON.stringify({ hh_home: 123 }));
		const removeItem = jest.spyOn(storage, "removeItem");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_home"),
		).resolves.toBeNull();

		expect(removeItem).toHaveBeenCalledWith(key);
		await expect(storage.getItem(key)).resolves.toBeNull();
	});
});

type MemoryStorage = CurrentListSelectionStorage & {
	keys: () => string[];
};

function memoryStorage(): MemoryStorage {
	const values = new Map<string, string>();

	return {
		async getItem(key) {
			return values.get(key) ?? null;
		},
		async setItem(key, value) {
			values.set(key, value);
		},
		async removeItem(key) {
			values.delete(key);
		},
		keys() {
			return Array.from(values.keys());
		},
	};
}

function onlyStorageKey(storage: MemoryStorage): string {
	const keys = storage.keys();
	expect(keys).toHaveLength(1);
	const [key] = keys;
	return key;
}

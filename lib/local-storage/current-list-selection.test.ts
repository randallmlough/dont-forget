import {
	type CurrentListSelectionStorage,
	createCurrentListSelectionStore,
} from "./current-list-selection";

describe("createCurrentListSelectionStore", () => {
	it("persists and reads a selection by userId + householdId across store instances", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBe("list_groceries");

		const restartedStore = createCurrentListSelectionStore({ storage });
		await expect(
			restartedStore.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBe("list_groceries");
	});

	it("overwrites a selection for the same userId + householdId", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_hardware",
		);

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBe("list_hardware");
	});

	it("keeps one User's selections isolated per Household", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await store.setCurrentListSelection(
			"usr_avery",
			"hh_shared",
			"list_hardware",
		);

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBe("list_groceries");
		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBe("list_hardware");
	});

	it("does not share selections between different Users in the same Household", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_shared",
			"list_groceries",
		);

		await expect(
			store.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBeNull();

		await store.setCurrentListSelection(
			"usr_blake",
			"hh_shared",
			"list_pharmacy",
		);

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBe("list_groceries");
		await expect(
			store.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBe("list_pharmacy");
	});

	it("clears only the given Household entry and preserves the User's other selections", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await store.setCurrentListSelection(
			"usr_avery",
			"hh_shared",
			"list_hardware",
		);

		await store.clearCurrentListSelection("usr_avery", "hh_avery");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBe("list_hardware");
	});

	it("removes the User's storage entry when the last Household selection is cleared", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await store.clearCurrentListSelection("usr_avery", "hh_avery");

		expect(storage.values.size).toBe(0);
	});

	it("clears all of one User's selections without touching other Users", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await store.setCurrentListSelection(
			"usr_avery",
			"hh_shared",
			"list_hardware",
		);
		await store.setCurrentListSelection(
			"usr_blake",
			"hh_shared",
			"list_pharmacy",
		);

		await store.clearUserCurrentListSelections("usr_avery");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBeNull();
		await expect(
			store.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBe("list_pharmacy");
	});

	it("removes a corrupt JSON payload and treats it as no selection", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		const key = await seededSelectionKey(storage, store);
		storage.values.set(key, "{ not json");

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		expect(storage.values.has(key)).toBe(false);
	});

	it("removes a payload whose map values are not strings and treats it as no selection", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		const key = await seededSelectionKey(storage, store);
		storage.values.set(key, JSON.stringify({ hh_avery: 42 }));

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		expect(storage.values.has(key)).toBe(false);
	});

	it("removes a payload that is not a plain object map and treats it as no selection", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		const key = await seededSelectionKey(storage, store);
		storage.values.set(key, JSON.stringify(["list_groceries"]));

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		expect(storage.values.has(key)).toBe(false);
	});

	it("starts a fresh selection map when writing over a corrupt payload", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });

		const key = await seededSelectionKey(storage, store);
		storage.values.set(key, "{ not json");

		await store.setCurrentListSelection(
			"usr_avery",
			"hh_shared",
			"list_hardware",
		);

		await expect(
			store.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		await expect(
			store.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBe("list_hardware");
	});
});

type MemoryStorage = CurrentListSelectionStorage & {
	values: Map<string, string>;
};

function memoryStorage(): MemoryStorage {
	const values = new Map<string, string>();

	return {
		values,
		async getItem(key) {
			return values.get(key) ?? null;
		},
		async setItem(key, value) {
			values.set(key, value);
		},
		async removeItem(key) {
			values.delete(key);
		},
	};
}

// Captures the storage key the implementation chose for usr_avery without
// asserting on its (unexported) format, so corrupt payloads can be seeded
// behaviorally.
async function seededSelectionKey(
	storage: MemoryStorage,
	store: ReturnType<typeof createCurrentListSelectionStore>,
): Promise<string> {
	await store.setCurrentListSelection(
		"usr_avery",
		"hh_avery",
		"list_groceries",
	);
	const keys = Array.from(storage.values.keys());
	expect(keys).toHaveLength(1);
	return keys[0] as string;
}

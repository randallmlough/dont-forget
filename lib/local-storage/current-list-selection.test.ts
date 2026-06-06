import { deferred } from "@/lib/test/async";
import {
	type CurrentListSelectionStorage,
	createCurrentListSelectionStore,
} from "./current-list-selection";

describe("createCurrentListSelectionStore", () => {
	it("stores and reads Current List selection for one User and Household", async () => {
		const store = createCurrentListSelectionStore({ storage: memoryStorage() });

		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});

		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBe("lst_groceries");
	});

	it("scopes Current List selections by Household under one User", async () => {
		const store = createCurrentListSelectionStore({ storage: memoryStorage() });

		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});
		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_cedar",
			listId: "lst_costco",
		});

		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBe("lst_groceries");
		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_cedar" }),
		).resolves.toBe("lst_costco");
	});

	it("scopes Current List selections by User on one device", async () => {
		const store = createCurrentListSelectionStore({ storage: memoryStorage() });

		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});
		await store.writeSelection({
			userId: "usr_blake",
			householdId: "hh_avery",
			listId: "lst_weekend",
		});

		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBe("lst_groceries");
		await expect(
			store.readSelection({ userId: "usr_blake", householdId: "hh_avery" }),
		).resolves.toBe("lst_weekend");
	});

	it("ignores and removes corrupt Current List selection payloads", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });
		await storage.setItem(
			"dont-forget:current-list-selection:usr_avery:v1",
			JSON.stringify({ hh_avery: 42 }),
		);

		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBeNull();
		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBeNull();
	});

	it("clears all Current List selections for a signed-out User", async () => {
		const store = createCurrentListSelectionStore({ storage: memoryStorage() });
		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});
		await store.writeSelection({
			userId: "usr_blake",
			householdId: "hh_avery",
			listId: "lst_weekend",
		});

		await store.clearSelectionsForUser("usr_avery");

		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBeNull();
		await expect(
			store.readSelection({ userId: "usr_blake", householdId: "hh_avery" }),
		).resolves.toBe("lst_weekend");
	});

	it("clears one Household Current List selection without clearing the User's other Households", async () => {
		const store = createCurrentListSelectionStore({ storage: memoryStorage() });
		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});
		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_cedar",
			listId: "lst_costco",
		});

		await store.clearSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
		});

		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBeNull();
		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_cedar" }),
		).resolves.toBe("lst_costco");
	});

	it("does not hide pending signed-out User cleanup in normal reads or writes", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });
		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});
		storage.removeItem.mockRejectedValueOnce(new Error("cleanup failed"));

		await expect(
			store.clearSignedOutSelectionsForUser("usr_avery"),
		).rejects.toThrow("cleanup failed");
		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toEqual(expect.any(String));

		storage.removeItem.mockClear();
		await expect(
			store.readSelection({ userId: "usr_avery", householdId: "hh_avery" }),
		).resolves.toBe("lst_groceries");
		await store.writeSelection({
			userId: "usr_blake",
			householdId: "hh_avery",
			listId: "lst_weekend",
		});

		expect(storage.removeItem).not.toHaveBeenCalled();
		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toEqual(expect.any(String));
	});

	it("retries failed signed-out User Current List selection cleanup through explicit drain", async () => {
		const storage = memoryStorage();
		const store = createCurrentListSelectionStore({ storage });
		await store.writeSelection({
			userId: "usr_avery",
			householdId: "hh_avery",
			listId: "lst_groceries",
		});
		storage.removeItem.mockRejectedValueOnce(new Error("cleanup failed"));

		await expect(
			store.clearSignedOutSelectionsForUser("usr_avery"),
		).rejects.toThrow("cleanup failed");

		await expect(
			store.drainPendingSignedOutSelections(),
		).resolves.toBeUndefined();
		await expect(
			storage.getItem("dont-forget:current-list-selection:signed-out-users:v1"),
		).resolves.toBeNull();
		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBeNull();
	});

	it("does not let a pending guarded write recreate a signed-out User selection after cleanup", async () => {
		const setItemGate = deferred<void>();
		const storage = gatedSetItemMemoryStorage(setItemGate.promise);
		const store = createCurrentListSelectionStore({ storage });
		let currentSession = true;

		const write = store.writeSelection(
			{
				userId: "usr_avery",
				householdId: "hh_avery",
				listId: "lst_weekend",
			},
			{ shouldCommit: () => currentSession },
		);
		await flushMicrotasks(3);
		expect(storage.setItem).toHaveBeenCalledWith(
			"dont-forget:current-list-selection:usr_avery:v1",
			JSON.stringify({ hh_avery: "lst_weekend" }),
		);

		currentSession = false;
		await store.clearSignedOutSelectionsForUser("usr_avery");
		setItemGate.resolve();
		await write;

		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBeNull();
	});

	it("does not restore previous selections for a signed-out User after cleanup", async () => {
		const setItemGate = deferred<void>();
		const storage = gatedSetItemMemoryStorage(setItemGate.promise, {
			"dont-forget:current-list-selection:usr_avery:v1": JSON.stringify({
				hh_avery: "lst_groceries",
				hh_cedar: "lst_costco",
			}),
		});
		const store = createCurrentListSelectionStore({ storage });
		let currentSession = true;

		const write = store.writeSelection(
			{
				userId: "usr_avery",
				householdId: "hh_avery",
				listId: "lst_weekend",
			},
			{ shouldCommit: () => currentSession },
		);
		await flushMicrotasks(3);
		expect(storage.setItem).toHaveBeenCalledWith(
			"dont-forget:current-list-selection:usr_avery:v1",
			JSON.stringify({
				hh_avery: "lst_weekend",
				hh_cedar: "lst_costco",
			}),
		);

		currentSession = false;
		await store.clearSignedOutSelectionsForUser("usr_avery");
		setItemGate.resolve();
		await write;

		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBeNull();
	});

	it("restores the previous User selection map when a guarded write becomes stale", async () => {
		const setItemGate = deferred<void>();
		const storage = gatedSetItemMemoryStorage(setItemGate.promise, {
			"dont-forget:current-list-selection:usr_avery:v1": JSON.stringify({
				hh_avery: "lst_groceries",
				hh_cedar: "lst_costco",
			}),
		});
		const store = createCurrentListSelectionStore({ storage });
		let currentSession = true;

		const write = store.writeSelection(
			{
				userId: "usr_avery",
				householdId: "hh_avery",
				listId: "lst_weekend",
			},
			{ shouldCommit: () => currentSession },
		);
		await flushMicrotasks(3);
		expect(storage.setItem).toHaveBeenCalledWith(
			"dont-forget:current-list-selection:usr_avery:v1",
			JSON.stringify({
				hh_avery: "lst_weekend",
				hh_cedar: "lst_costco",
			}),
		);

		currentSession = false;
		setItemGate.resolve();
		await write;

		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBe(
			JSON.stringify({
				hh_avery: "lst_groceries",
				hh_cedar: "lst_costco",
			}),
		);
	});

	it("does not let a pending guarded clear recreate signed-out User selections after cleanup", async () => {
		const setItemGate = deferred<void>();
		const storage = gatedSetItemMemoryStorage(setItemGate.promise, {
			"dont-forget:current-list-selection:usr_avery:v1": JSON.stringify({
				hh_avery: "lst_groceries",
				hh_cedar: "lst_costco",
			}),
		});
		const store = createCurrentListSelectionStore({ storage });
		let currentSession = true;

		const clear = store.clearSelection(
			{
				userId: "usr_avery",
				householdId: "hh_avery",
			},
			{ shouldCommit: () => currentSession },
		);
		await flushMicrotasks(3);
		expect(storage.setItem).toHaveBeenCalledWith(
			"dont-forget:current-list-selection:usr_avery:v1",
			JSON.stringify({
				hh_cedar: "lst_costco",
			}),
		);

		currentSession = false;
		await store.clearSignedOutSelectionsForUser("usr_avery");
		setItemGate.resolve();
		await clear;

		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBeNull();
	});

	it("restores the previous User selection map when a guarded clear becomes stale without cleanup", async () => {
		const setItemGate = deferred<void>();
		const storage = gatedSetItemMemoryStorage(setItemGate.promise, {
			"dont-forget:current-list-selection:usr_avery:v1": JSON.stringify({
				hh_avery: "lst_groceries",
				hh_cedar: "lst_costco",
			}),
		});
		const store = createCurrentListSelectionStore({ storage });
		let currentSession = true;

		const clear = store.clearSelection(
			{
				userId: "usr_avery",
				householdId: "hh_avery",
			},
			{ shouldCommit: () => currentSession },
		);
		await flushMicrotasks(3);
		expect(storage.setItem).toHaveBeenCalledWith(
			"dont-forget:current-list-selection:usr_avery:v1",
			JSON.stringify({
				hh_cedar: "lst_costco",
			}),
		);

		currentSession = false;
		setItemGate.resolve();
		await clear;

		await expect(
			storage.getItem("dont-forget:current-list-selection:usr_avery:v1"),
		).resolves.toBe(
			JSON.stringify({
				hh_avery: "lst_groceries",
				hh_cedar: "lst_costco",
			}),
		);
	});
});

function memoryStorage(): jest.Mocked<CurrentListSelectionStorage> {
	const values = new Map<string, string>();
	return {
		getItem: jest.fn(async (key) => values.get(key) ?? null),
		setItem: jest.fn(async (key, value) => {
			values.set(key, value);
		}),
		removeItem: jest.fn(async (key) => {
			values.delete(key);
		}),
	};
}

function gatedSetItemMemoryStorage(
	gate: Promise<void>,
	initialValues: Record<string, string> = {},
): jest.Mocked<CurrentListSelectionStorage> {
	const values = new Map<string, string>(Object.entries(initialValues));
	return {
		getItem: jest.fn(async (key) => values.get(key) ?? null),
		setItem: jest.fn(async (key, value) => {
			await gate;
			values.set(key, value);
		}),
		removeItem: jest.fn(async (key) => {
			values.delete(key);
		}),
	};
}

async function flushMicrotasks(count: number) {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

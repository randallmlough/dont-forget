import { createCurrentListSelectionStore } from "@mobile/features/list/current-selection";
import { deferred, waitForAsync } from "@mobile/test/async";
import { createMockAnalytics } from "@mobile/test/mocks/analytics";
import { createMockLogger } from "@mobile/test/mocks/logger";
import {
	type AuthenticatedAppSessionSignOutAuth,
	createAuthenticatedAppSessionSignOut,
} from "./sign-out";

describe("createAuthenticatedAppSessionSignOut", () => {
	it("clears the signed-out User's Current List selections and leaves other Users' untouched", async () => {
		const selectionStore = createCurrentListSelectionStore({
			storage: memorySelectionStorage(),
		});
		await selectionStore.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await selectionStore.setCurrentListSelection(
			"usr_blake",
			"hh_shared",
			"list_pharmacy",
		);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser:
				selectionStore.clearUserCurrentListSelections,
			logger: createMockLogger(),
			disconnect: jest.fn(async () => undefined),
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		await expect(
			selectionStore.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		await expect(
			selectionStore.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBe("list_pharmacy");
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("disconnects while preserving local rows, ownership, and queued writes", async () => {
		const order: string[] = [];
		const database = {
			rows: ["item_local"],
			owner: "usr_avery",
			queuedWrites: ["write_local"],
			disconnect: jest.fn(async () => {
				order.push("disconnect");
			}),
			disconnectAndClear: jest.fn(async () => {
				database.rows = [];
				database.owner = "";
				database.queuedWrites = [];
			}),
		};
		const clearPersistedSession = jest.fn(async () => {
			order.push("hint");
		});
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: clearPersistedSession,
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
			disconnect: database.disconnect,
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(database.disconnect).toHaveBeenCalledTimes(1);
		expect(database.disconnectAndClear).not.toHaveBeenCalled();
		expect(database.rows).toEqual(["item_local"]);
		expect(database.owner).toBe("usr_avery");
		expect(database.queuedWrites).toEqual(["write_local"]);
		expect(clearPersistedSession).toHaveBeenCalledTimes(1);
		expect(order).toEqual(["hint", "disconnect"]);
	});

	it("captures the User ID before Clerk sign-out", async () => {
		let currentUserId: string | null = "usr_avery";
		const clearCurrentListSelectionsForUser = jest.fn(
			async (_userId: string) => {
				expect(currentUserId).toBeNull();
			},
		);
		const auth = authFixture({
			signOut: jest.fn(async () => {
				currentUserId = null;
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnect: jest.fn(async () => undefined),
			getSessionUserId: () => currentUserId,
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_avery");
	});

	it("skips selection cleanup when no session was ever published", async () => {
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnect: jest.fn(async () => undefined),
			getSessionUserId: () => null,
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("rethrows when Clerk sign-out fails", async () => {
		const signOutError = new Error("network down");
		const analytics = createMockAnalytics();
		const disconnect = jest.fn(async () => undefined);
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const auth = authFixture({
			signOut: jest.fn(async () => {
				throw signOutError;
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnect,
			getSessionUserId: () => "usr_avery",
		});

		await expect(signOutFlow.run()).rejects.toThrow("network down");
		expect(disconnect).not.toHaveBeenCalled();
		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		expect(analytics.reset).not.toHaveBeenCalled();
	});

	it("can retry after Clerk sign-out fails", async () => {
		const auth = authFixture({
			signOut: jest
				.fn<Promise<void>, []>()
				.mockRejectedValueOnce(new Error("network down"))
				.mockResolvedValueOnce(undefined),
		});
		const analytics = createMockAnalytics();
		const disconnect = jest.fn(async () => undefined);
		const clearHint = jest.fn(async () => undefined);
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionPresent: clearHint,
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnect,
			getSessionUserId: () => "usr_avery",
		});

		await expect(signOutFlow.run()).rejects.toThrow("network down");
		await expect(signOutFlow.run()).resolves.toBeUndefined();

		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(clearHint).toHaveBeenCalledTimes(2);
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledTimes(1);
		expect(auth.signOut).toHaveBeenCalledTimes(2);
		expect(analytics.track).toHaveBeenCalledTimes(1);
		expect(analytics.reset).toHaveBeenCalledTimes(1);
	});

	it("runs critical sign-out, cleanup, and analytics in order", async () => {
		const order: string[] = [];
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => {
			order.push("track");
		});
		analytics.reset.mockImplementation(() => {
			order.push("reset");
		});
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerkSignOut");
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionPresent: jest.fn(async () => {
				order.push("hint");
			}),
			clearCurrentListSelectionsForUser: jest.fn(async () => {
				order.push("selections");
			}),
			logger: createMockLogger(),
			disconnect: jest.fn(async () => {
				order.push("disconnect");
			}),
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(order).toEqual([
			"hint",
			"clerkSignOut",
			"disconnect",
			"selections",
			"track",
			"reset",
		]);
	});

	it("awaits each async cleanup step before starting the next one", async () => {
		const order: string[] = [];
		const disconnect = deferred<void>();
		const hint = deferred<void>();
		const selections = deferred<void>();
		const clerkSignOut = deferred<void>();
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => {
			order.push("track");
		});
		analytics.reset.mockImplementation(() => {
			order.push("reset");
		});
		const auth = authFixture({
			signOut: jest.fn(() => {
				order.push("clerkSignOut");
				return clerkSignOut.promise;
			}),
		});
		const clearHint = jest.fn(() => {
			order.push("hint");
			return hint.promise;
		});
		const clearCurrentListSelectionsForUser = jest.fn(() => {
			order.push("selections");
			return selections.promise;
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionPresent: clearHint,
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnect: jest.fn(() => {
				order.push("disconnect");
				return disconnect.promise;
			}),
			getSessionUserId: () => "usr_avery",
		});

		const run = signOutFlow.run();
		await waitForAsync(() => expect(order).toEqual(["hint"]));
		expect(clearHint).toHaveBeenCalledTimes(1);
		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();

		hint.resolve(undefined);
		await waitForAsync(() => expect(order).toEqual(["hint", "clerkSignOut"]));
		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();

		clerkSignOut.resolve(undefined);
		await waitForAsync(() =>
			expect(order).toEqual(["hint", "clerkSignOut", "disconnect"]),
		);
		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();

		disconnect.resolve(undefined);
		await waitForAsync(() =>
			expect(order).toEqual([
				"hint",
				"clerkSignOut",
				"disconnect",
				"selections",
			]),
		);

		selections.resolve(undefined);
		await expect(run).resolves.toBeUndefined();
		expect(order).toEqual([
			"hint",
			"clerkSignOut",
			"disconnect",
			"selections",
			"track",
			"reset",
		]);
	});

	it("does not call Clerk sign-out when the persisted restore payload cannot be cleared", async () => {
		const auth = authFixture();
		const clearError = new Error("cleanup failed");
		const analytics = createMockAnalytics();
		const disconnect = jest.fn(async () => undefined);
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionPresent: jest.fn(async () => {
				throw clearError;
			}),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
			disconnect,
			getSessionUserId: () => "usr_avery",
		});

		await expect(signOutFlow.run()).rejects.toThrow("cleanup failed");

		expect(disconnect).not.toHaveBeenCalled();
		expect(auth.signOut).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
		expect(analytics.reset).not.toHaveBeenCalled();
	});

	it("completes Sign Out when disconnect fails", async () => {
		const logger = createMockLogger();
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger,
			disconnect: jest.fn(async () => {
				throw new Error("disconnect failed");
			}),
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(auth.signOut).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out disconnect failed",
			{ error: expect.any(Error) },
		);
	});
});

function authFixture(
	overrides: Partial<AuthenticatedAppSessionSignOutAuth> = {},
): AuthenticatedAppSessionSignOutAuth {
	return {
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function memorySelectionStorage() {
	const values = new Map<string, string>();
	return {
		async getItem(key: string) {
			return values.get(key) ?? null;
		},
		async setItem(key: string, value: string) {
			values.set(key, value);
		},
		async removeItem(key: string) {
			values.delete(key);
		},
	};
}

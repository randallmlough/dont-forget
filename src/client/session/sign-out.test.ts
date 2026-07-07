import { createCurrentListSelectionStore } from "@/client/features/list/current-selection";
import { deferred, waitForAsync } from "@/test/async";
import { createMockAnalytics } from "@/test/mocks/analytics";
import { createMockLogger } from "@/test/mocks/logger";
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
			disconnectAndClear: jest.fn(async () => undefined),
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

	it("wipes the local PowerSync data and clears the persisted restore payload", async () => {
		const disconnectAndClear = jest.fn(async () => undefined);
		const clearPersistedSession = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: clearPersistedSession,
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
			disconnectAndClear,
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(disconnectAndClear).toHaveBeenCalledTimes(1);
		expect(clearPersistedSession).toHaveBeenCalledTimes(1);
	});

	it("captures the userId before local data is wiped", async () => {
		let currentUserId: string | null = "usr_avery";
		const clearCurrentListSelectionsForUser = jest.fn(
			async (_userId: string) => {
				expect(currentUserId).toBeNull();
			},
		);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnectAndClear: jest.fn(async () => {
				currentUserId = null;
			}),
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
			disconnectAndClear: jest.fn(async () => undefined),
			getSessionUserId: () => null,
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("rethrows when Clerk sign-out fails", async () => {
		const signOutError = new Error("network down");
		const auth = authFixture({
			signOut: jest.fn(async () => {
				throw signOutError;
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
			disconnectAndClear: jest.fn(async () => undefined),
			getSessionUserId: () => "usr_avery",
		});

		await expect(signOutFlow.run()).rejects.toThrow("network down");
	});

	it("can retry after Clerk sign-out fails", async () => {
		const auth = authFixture({
			signOut: jest
				.fn<Promise<void>, []>()
				.mockRejectedValueOnce(new Error("network down"))
				.mockResolvedValueOnce(undefined),
		});
		const disconnectAndClear = jest.fn(async () => undefined);
		const clearHint = jest.fn(async () => undefined);
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: clearHint,
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
			disconnectAndClear,
			getSessionUserId: () => "usr_avery",
		});

		await expect(signOutFlow.run()).rejects.toThrow("network down");
		await expect(signOutFlow.run()).resolves.toBeUndefined();

		expect(disconnectAndClear).toHaveBeenCalledTimes(2);
		expect(clearHint).toHaveBeenCalledTimes(2);
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledTimes(2);
		expect(auth.signOut).toHaveBeenCalledTimes(2);
	});

	it("runs cleanup in order: track, reset, disconnect, hint, selections, Clerk sign-out", async () => {
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
			disconnectAndClear: jest.fn(async () => {
				order.push("disconnect");
			}),
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(order).toEqual([
			"track",
			"reset",
			"disconnect",
			"hint",
			"selections",
			"clerkSignOut",
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
			disconnectAndClear: jest.fn(() => {
				order.push("disconnect");
				return disconnect.promise;
			}),
			getSessionUserId: () => "usr_avery",
		});

		const run = signOutFlow.run();
		await waitForAsync(() =>
			expect(order).toEqual(["track", "reset", "disconnect"]),
		);
		expect(clearHint).not.toHaveBeenCalled();

		disconnect.resolve(undefined);
		await waitForAsync(() =>
			expect(order).toEqual(["track", "reset", "disconnect", "hint"]),
		);
		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();

		hint.resolve(undefined);
		await waitForAsync(() =>
			expect(order).toEqual([
				"track",
				"reset",
				"disconnect",
				"hint",
				"selections",
			]),
		);
		expect(auth.signOut).not.toHaveBeenCalled();

		selections.resolve(undefined);
		await waitForAsync(() =>
			expect(order).toEqual([
				"track",
				"reset",
				"disconnect",
				"hint",
				"selections",
				"clerkSignOut",
			]),
		);

		clerkSignOut.resolve(undefined);
		await expect(run).resolves.toBeUndefined();
	});

	it("does not call Clerk sign-out when the persisted restore payload cannot be cleared", async () => {
		const auth = authFixture();
		const clearError = new Error("cleanup failed");
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => {
				throw clearError;
			}),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
			disconnectAndClear: jest.fn(async () => undefined),
			getSessionUserId: () => "usr_avery",
		});

		await expect(signOutFlow.run()).rejects.toThrow("cleanup failed");

		expect(auth.signOut).not.toHaveBeenCalled();
	});

	it("continues Clerk sign-out when disconnect fails", async () => {
		const logger = createMockLogger();
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger,
			disconnectAndClear: jest.fn(async () => {
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

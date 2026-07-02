import { createCurrentListSelectionStore } from "@/client/features/list/current-selection";
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

	it("wipes the local PowerSync data and clears the cold-start hint", async () => {
		const disconnectAndClear = jest.fn(async () => undefined);
		const clearHint = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: clearHint,
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
			disconnectAndClear,
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(disconnectAndClear).toHaveBeenCalledTimes(1);
		expect(clearHint).toHaveBeenCalledTimes(1);
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

	it("continues Clerk sign-out when local cleanup fails", async () => {
		const logger = createMockLogger();
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => {
				throw new Error("cleanup failed");
			}),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger,
			disconnectAndClear: jest.fn(async () => undefined),
			getSessionUserId: () => "usr_avery",
		});

		await signOutFlow.run();

		expect(auth.signOut).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out local cleanup failed",
			{ error: expect.any(Error) },
		);
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
		getToken: jest.fn(async () => "session-token"),
		authReady: true,
		signedIn: false,
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

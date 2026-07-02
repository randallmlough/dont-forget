import { createCurrentListSelectionStore } from "@/client/features/list/current-selection";
import { createMockAnalytics } from "@/test/mocks/analytics";
import { createMockLogger } from "@/test/mocks/logger";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionServices,
	AuthenticatedAppSessionStateSnapshot,
} from "./controller";
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
			controller: controllerFixture(readySnapshot("usr_avery")),
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser:
				selectionStore.clearUserCurrentListSelections,
			logger: createMockLogger(),
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

	it("wipes the local PowerSync data via controller dispose and clears the cold-start hint", async () => {
		const controller = controllerFixture(readySnapshot("usr_avery"));
		const clearHint = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: clearHint,
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(controller.dispose).toHaveBeenCalledWith({ clearLocalData: true });
		expect(clearHint).toHaveBeenCalledTimes(1);
	});

	it("captures the userId from the pre-disposal snapshot", async () => {
		const controller = controllerFixture(readySnapshot("usr_avery"));
		const clearCurrentListSelectionsForUser = jest.fn(
			async (_userId: string) => {
				// dispose already published idle, so the userId came from the
				// pre-disposal snapshot.
				expect(controller.getSnapshot()).toEqual({ status: "idle" });
			},
		);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_avery");
	});

	it("derives the userId from the previous session mid-refresh", async () => {
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller: controllerFixture({
				status: "loading",
				previous: appSessionFixture("usr_blake"),
				refreshingSession: true,
			}),
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_blake");
	});

	it("skips selection cleanup when no session was ever published", async () => {
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller: controllerFixture({ status: "loading" }),
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("re-activates and rethrows when Clerk sign-out fails while still signed in", async () => {
		const controller = controllerFixture(readySnapshot("usr_avery"));
		const signOutError = new Error("network down");
		const auth = authFixture({
			signedIn: true,
			signOut: jest.fn(async () => {
				throw signOutError;
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearAuthenticatedAppSessionPresent: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			logger: createMockLogger(),
		});

		await expect(signOutFlow.run()).rejects.toThrow("network down");
		expect(controller.activate).toHaveBeenCalledTimes(1);
	});

	it("runs cleanup in order: track, reset, dispose, hint, selections, Clerk sign-out", async () => {
		const order: string[] = [];
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => {
			order.push("track");
		});
		analytics.reset.mockImplementation(() => {
			order.push("reset");
		});
		const controller = controllerFixture(readySnapshot("usr_avery"));
		jest.mocked(controller.dispose).mockImplementation(async () => {
			order.push("dispose");
		});
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerkSignOut");
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionPresent: jest.fn(async () => {
				order.push("hint");
			}),
			clearCurrentListSelectionsForUser: jest.fn(async () => {
				order.push("selections");
			}),
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(order).toEqual([
			"track",
			"reset",
			"dispose",
			"hint",
			"selections",
			"clerkSignOut",
		]);
	});
});

function servicesFixture(): AuthenticatedAppSessionServices {
	const unused = jest.fn(async () => {
		throw new Error("session service not expected during sign-out");
	});
	return {
		lists: {
			createList: unused,
			getList: unused,
			renameList: unused,
			deleteList: unused,
			listLists: unused,
		},
		items: {
			listItems: unused,
			addItem: unused,
			setItemChecked: unused,
		},
		changes: { subscribe: () => ({ remove() {} }) },
		sync: {
			getStatus: () => "synced",
			subscribe: () => ({ remove() {} }),
		},
	};
}

function appSessionFixture(userId: string): AuthenticatedAppSession {
	return {
		user: {
			id: userId,
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery's Home" },
		households: [],
		activeMember: {
			id: "mbr_avery",
			userId,
			role: "owner",
			displayName: "Avery",
		},
		members: [],
		resourceKey: "authenticated-app-session:1",
		services: servicesFixture(),
	};
}

function readySnapshot(userId: string): AuthenticatedAppSessionStateSnapshot {
	return { status: "ready", session: appSessionFixture(userId) };
}

function controllerFixture(
	initialSnapshot: AuthenticatedAppSessionStateSnapshot,
): AuthenticatedAppSessionController {
	let snapshot = initialSnapshot;
	return {
		activate: jest.fn(async () => undefined),
		dispose: jest.fn(async () => {
			snapshot = { status: "idle" };
		}),
		invalidateCurrentSession: jest.fn(async () => undefined),
		getSnapshot: () => snapshot,
		subscribe: jest.fn(() => ({ remove() {} })),
	};
}

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

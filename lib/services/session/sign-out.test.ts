import { createCurrentListSelectionStore } from "@/lib/local-storage/current-list-selection";
import { createMockAnalytics } from "@/lib/test/mocks/analytics";
import { createMockLogger } from "@/lib/test/mocks/logger";
import { sessionBootstrapFixture } from "./bootstrap.test-helpers";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionStateSnapshot,
} from "./controller";
import {
	sessionDataServicesFixture,
	syncCoordinatorFixture,
} from "./controller.test-helpers";
import {
	type AuthenticatedAppSessionSignOutAuth,
	createAuthenticatedAppSessionSignOut,
} from "./sign-out";

describe("createAuthenticatedAppSessionSignOut", () => {
	it("clears the signed-out User's Current List selections and leaves other Users' selections untouched", async () => {
		const selectionStore = createCurrentListSelectionStore({
			storage: memorySelectionStorage(),
		});
		await selectionStore.setCurrentListSelection(
			"usr_avery",
			"hh_avery",
			"list_groceries",
		);
		await selectionStore.setCurrentListSelection(
			"usr_avery",
			"hh_shared",
			"list_hardware",
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
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser:
				selectionStore.clearUserCurrentListSelections,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		await expect(
			selectionStore.getCurrentListSelection("usr_avery", "hh_avery"),
		).resolves.toBeNull();
		await expect(
			selectionStore.getCurrentListSelection("usr_avery", "hh_shared"),
		).resolves.toBeNull();
		await expect(
			selectionStore.getCurrentListSelection("usr_blake", "hh_shared"),
		).resolves.toBe("list_pharmacy");
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("passes the app userId captured from the session snapshot before controller disposal", async () => {
		const controller = controllerFixture(readySnapshot("usr_avery"));
		const clearCurrentListSelectionsForUser = jest.fn(
			async (_userId: string) => {
				// Disposal already published the idle snapshot, so the userId must
				// have been captured from the pre-disposal snapshot.
				expect(controller.getSnapshot()).toEqual({ status: "idle" });
			},
		);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledTimes(1);
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_avery");
	});

	it("derives the app userId from the previous session when sign-out starts mid-refresh", async () => {
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
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_blake");
	});

	it("skips Current List selection cleanup when no session was ever published", async () => {
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller: controllerFixture({ status: "loading" }),
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser,
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(clearCurrentListSelectionsForUser).not.toHaveBeenCalled();
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("logs Current List selection cleanup failure and still attempts Clerk sign-out", async () => {
		const cleanupFailure = new Error("selection cleanup failed");
		const logger = createMockLogger();
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller: controllerFixture(readySnapshot("usr_avery")),
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => {
				throw cleanupFailure;
			}),
			logger,
		});

		await signOutFlow.run();

		expect(logger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out current list selection cleanup failed",
			{ error: cleanupFailure },
		);
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("clears push notifications for the signed-out User before Clerk sign-out", async () => {
		const order: string[] = [];
		const controller = controllerFixture(readySnapshot("usr_avery"));
		const auth = authFixture({
			signOut: jest.fn(async () => {
				order.push("clerkSignOut");
			}),
		});
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			clearPushNotificationsForUser: jest.fn(async ({ getToken, userId }) => {
				order.push("clearPushNotifications");
				expect(userId).toBe("usr_avery");
				expect(await getToken()).toBe("session-token");
				expect(controller.getSnapshot()).toEqual({ status: "idle" });
			}),
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(order).toEqual(["clearPushNotifications", "clerkSignOut"]);
	});

	it("logs push notification cleanup failure and still attempts Clerk sign-out", async () => {
		const cleanupFailure = new Error("push cleanup failed");
		const logger = createMockLogger();
		const auth = authFixture();
		const signOutFlow = createAuthenticatedAppSessionSignOut({
			controller: controllerFixture(readySnapshot("usr_avery")),
			getAuth: () => auth,
			analytics: createMockAnalytics(),
			clearSignedOutSessionData: jest.fn(async () => undefined),
			clearCurrentListSelectionsForUser: jest.fn(async () => undefined),
			clearPushNotificationsForUser: jest.fn(async () => {
				throw cleanupFailure;
			}),
			logger,
		});

		await signOutFlow.run();

		expect(logger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out push notification cleanup failed",
			{ error: cleanupFailure },
		);
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});

	it("preserves the sign-out order with selection cleanup after session data cleanup and before Clerk sign-out", async () => {
		const order: string[] = [];
		const analytics = createMockAnalytics();
		analytics.track.mockImplementation(() => {
			order.push("track");
		});
		analytics.reset.mockImplementation(() => {
			order.push("reset");
		});
		const controller = controllerFixture(readySnapshot("usr_avery"));
		const dispose = jest.mocked(controller.dispose);
		const baseDispose = dispose.getMockImplementation();
		dispose.mockImplementation(async () => {
			order.push("dispose");
			return baseDispose
				? baseDispose()
				: { householdIdsForLocalDataDeletion: [] };
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
			clearSignedOutSessionData: jest.fn(async () => {
				order.push("clearSignedOutSessionData");
			}),
			clearCurrentListSelectionsForUser: jest.fn(async () => {
				order.push("clearCurrentListSelections");
			}),
			clearPushNotificationsForUser: jest.fn(async () => {
				order.push("clearPushNotifications");
			}),
			logger: createMockLogger(),
		});

		await signOutFlow.run();

		expect(order).toEqual([
			"track",
			"reset",
			"dispose",
			"clearSignedOutSessionData",
			"clearCurrentListSelections",
			"clearPushNotifications",
			"clerkSignOut",
		]);
	});
});

function appSessionFixture(userId: string): AuthenticatedAppSession {
	const bootstrap = sessionBootstrapFixture();
	const services = sessionDataServicesFixture();
	const syncCoordinator = syncCoordinatorFixture();

	return {
		user: { ...bootstrap.user, id: userId },
		activeHousehold: bootstrap.activeHousehold,
		households: bootstrap.households,
		activeMember: bootstrap.activeMember,
		members: bootstrap.members,
		resourceKey: "session-resource",
		services: {
			lists: services.lists,
			items: services.items,
			changes: services.changes,
			sync: {
				getStatus: syncCoordinator.getStatus,
				subscribe: syncCoordinator.subscribe,
				requestSync: syncCoordinator.requestSync,
			},
		},
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
			return { householdIdsForLocalDataDeletion: [] };
		}),
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

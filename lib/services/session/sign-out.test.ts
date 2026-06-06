import { createMockAnalytics } from "@/lib/test/mocks/analytics";
import { createMockLogger } from "@/lib/test/mocks/logger";
import type { AuthenticatedAppSessionController } from "./controller";
import {
	type AuthenticatedAppSessionSignOutAuth,
	createAuthenticatedAppSessionSignOut,
} from "./sign-out";

jest.mock("@/lib/analytics", () =>
	jest.requireActual("@/lib/test/mocks/analytics"),
);

describe("createAuthenticatedAppSessionSignOut", () => {
	it("clears Current List selections for the signed-out User during local cleanup", async () => {
		const clearSignedOutSessionData = jest.fn(async () => undefined);
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const signOut = jest.fn(async () => undefined);
		const controller = controllerFixture();

		await createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => authFixture({ signOut }),
			analytics: createMockAnalytics(),
			clearSignedOutSessionData,
			clearCurrentListSelectionsForUser,
		}).run();

		expect(clearSignedOutSessionData).toHaveBeenCalledWith(["hh_avery"]);
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_avery");
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it("clears Current List selections even when signed-out session cleanup fails", async () => {
		const clearSignedOutSessionData = jest.fn(async () => {
			throw new Error("session cleanup failed");
		});
		const clearCurrentListSelectionsForUser = jest.fn(async () => undefined);
		const signOut = jest.fn(async () => undefined);
		const logger = createMockLogger();

		await createAuthenticatedAppSessionSignOut({
			controller: controllerFixture(),
			getAuth: () => authFixture({ signOut }),
			analytics: createMockAnalytics(),
			clearSignedOutSessionData,
			clearCurrentListSelectionsForUser,
			logger,
		}).run();

		expect(clearSignedOutSessionData).toHaveBeenCalledWith(["hh_avery"]);
		expect(clearCurrentListSelectionsForUser).toHaveBeenCalledWith("usr_avery");
		expect(logger.error).toHaveBeenCalledWith(
			"authenticated app session sign-out local cleanup failed",
			expect.any(Object),
		);
		expect(signOut).toHaveBeenCalledTimes(1);
	});
});

function authFixture(
	overrides: Partial<AuthenticatedAppSessionSignOutAuth> = {},
): AuthenticatedAppSessionSignOutAuth {
	return {
		authReady: true,
		signedIn: true,
		getToken: jest.fn(async () => "token"),
		signOut: jest.fn(async () => undefined),
		...overrides,
	};
}

function controllerFixture(): AuthenticatedAppSessionController {
	return {
		activate: jest.fn(async () => undefined),
		dispose: jest.fn(async () => ({
			householdIdsForLocalDataDeletion: ["hh_avery"],
		})),
		getSnapshot: jest.fn(() => ({
			status: "ready",
			session: {
				user: {
					id: "usr_avery",
					email: "avery@example.com",
					displayName: "Avery Chen",
				},
				activeHousehold: { id: "hh_avery", name: "Avery" },
				households: [
					{
						id: "hh_avery",
						name: "Avery",
						role: "owner",
						isActive: true,
					},
				],
				activeMember: {
					id: "mbr_avery",
					userId: "usr_avery",
					role: "owner",
					displayName: "Avery Chen",
				},
				members: [],
				resourceKey: "authenticated-app-session:seeded",
				services: {
					lists: {
						archiveList: jest.fn(),
						createList: jest.fn(),
						deleteList: jest.fn(),
						getList: jest.fn(),
						listLists: jest.fn(),
						listActiveLists: jest.fn(),
						renameList: jest.fn(),
						unarchiveList: jest.fn(),
					},
					items: {
						listItems: jest.fn(),
						addItem: jest.fn(),
						setItemChecked: jest.fn(),
					},
					sync: {
						getStatus: jest.fn(() => "synced"),
						subscribe: jest.fn(() => ({ remove() {} })),
						requestSync: jest.fn(),
					},
				},
			},
		})),
		subscribe: jest.fn(() => ({ remove() {} })),
	};
}

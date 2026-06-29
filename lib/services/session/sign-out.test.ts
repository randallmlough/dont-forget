import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type { AuthenticatedAppSessionController } from "./controller";
import { createAuthenticatedAppSessionSignOut } from "./sign-out";

describe("createAuthenticatedAppSessionSignOut", () => {
	it("clears PowerSync local data and signed-in hints before Clerk signOut", async () => {
		const order: string[] = [];
		const controller = controllerFixture(order);
		const auth = authFixture(order);
		const clearHint = jest.fn(async () => {
			order.push("clearHint");
		});
		const clearSelections = jest.fn(async () => {
			order.push("clearSelections");
		});
		const analytics = {
			track: jest.fn(() => order.push("track")),
			reset: jest.fn(() => order.push("reset")),
		};

		const signOut = createAuthenticatedAppSessionSignOut({
			controller,
			getAuth: () => auth,
			analytics,
			clearAuthenticatedAppSessionAvailability: clearHint,
			clearCurrentListSelectionsForUser: clearSelections,
		});

		await signOut.run();

		expect(controller.dispose).toHaveBeenCalledWith({ clearLocalData: true });
		expect(clearSelections).toHaveBeenCalledWith("usr_1");
		expect(order).toEqual([
			"track",
			"reset",
			"dispose",
			"clearHint",
			"clearSelections",
			"signOut",
		]);
	});
});

function controllerFixture(
	order: string[],
): jest.Mocked<AuthenticatedAppSessionController> {
	return {
		activate: jest.fn(async (_activation) => undefined),
		dispose: jest.fn(async () => {
			order.push("dispose");
		}),
		getSnapshot: jest.fn(() => ({
			status: "ready",
			session: {
				user: {
					id: "usr_1",
					email: "avery@example.com",
					displayName: "Avery",
					firstName: "Avery",
					lastName: null,
				},
				activeHousehold: { id: "hh_1", name: "Avery" },
				households: [
					{ id: "hh_1", name: "Avery", role: "owner" as const, isActive: true },
				],
				activeMember: {
					id: "mbr_1",
					userId: "usr_1",
					role: "owner" as const,
					displayName: "Avery",
				},
				members: [],
				resourceKey: "session:1",
				services: {
					lists: listServiceFixture(),
					items: itemServiceFixture(),
					changes: { subscribe: () => ({ remove() {} }) },
					sync: {
						getStatus: () => "synced" as const,
						subscribe: () => ({ remove() {} }),
					},
				},
			},
		})),
		invalidateCurrentSession: jest.fn(async () => undefined),
		subscribe: jest.fn((_subscriber) => ({ remove() {} })),
	};
}

function authFixture(order: string[]) {
	return {
		getToken: jest.fn(async () => "session-token"),
		getPowerSyncToken: jest.fn(async () => "powersync-token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => {
			order.push("signOut");
		}),
	};
}

function listServiceFixture(): ListService {
	return {
		createList: jest.fn(async () => ({
			status: "invalidName" as const,
			reason: "required" as const,
			didWrite: false as const,
		})),
		getList: jest.fn(async () => ({
			status: "missing" as const,
			listId: "lst_1",
		})),
		renameList: jest.fn(async () => ({
			status: "missing" as const,
			listId: "lst_1",
			didWrite: false as const,
		})),
		deleteList: jest.fn(async () => ({
			status: "missing" as const,
			listId: "lst_1",
			didWrite: false as const,
		})),
		listLists: jest.fn(async () => []),
	};
}

function itemServiceFixture(): ItemService {
	return {
		listItems: jest.fn(async () => []),
		addItem: jest.fn(async () => {
			throw new Error("not implemented");
		}),
		setItemChecked: jest.fn(async () => undefined),
	};
}

import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import {
	AuthenticatedAppSessionProvider,
	useAuthenticatedAppSession,
} from "@/components/session";
import type { ItemService } from "@/lib/services/item";
import type { ListService } from "@/lib/services/list";
import type {
	AuthenticatedAppSession,
	AuthenticatedAppSessionController,
	AuthenticatedAppSessionStateSnapshot,
} from "@/lib/services/session";

jest.mock("@/lib/powersync", () => ({
	PowerSyncConnector: jest.fn(),
	powerSyncAppDatabase: {},
	readPowerSyncUrl: jest.fn(() => "https://sync.test"),
}));

describe("AuthenticatedAppSessionProvider", () => {
	it("activates with session and PowerSync token getters", async () => {
		const controller = controllerFixture({ status: "idle" });
		const auth = authFixture();

		await render(
			<AuthenticatedAppSessionProvider controller={controller} auth={auth}>
				<Text>Child</Text>
			</AuthenticatedAppSessionProvider>,
		);

		await waitFor(() => expect(controller.activate).toHaveBeenCalledTimes(1));
		const activation = controller.activate.mock.calls[0][0];

		await expect(activation.getToken()).resolves.toBe("session-token");
		await expect(activation.getPowerSyncToken?.()).resolves.toBe(
			"powersync-token",
		);
	});

	it("runs sign-out through the provider context", async () => {
		const controller = controllerFixture({
			status: "ready",
			session: appSessionFixture(),
		});
		const auth = authFixture();
		const clearHint = jest.fn(async () => undefined);

		await render(
			<AuthenticatedAppSessionProvider
				controller={controller}
				auth={auth}
				clearAuthenticatedAppSessionAvailability={clearHint}
			>
				<SignOutButton />
			</AuthenticatedAppSessionProvider>,
		);

		await fireEvent.press(screen.getByText("Sign out"));

		await waitFor(() =>
			expect(controller.dispose).toHaveBeenCalledWith({ clearLocalData: true }),
		);
		expect(clearHint).toHaveBeenCalledTimes(1);
		expect(auth.signOut).toHaveBeenCalledTimes(1);
	});
});

function SignOutButton() {
	const { signOut } = useAuthenticatedAppSession();
	return (
		<Pressable accessibilityRole="button" onPress={() => void signOut()}>
			<Text>Sign out</Text>
		</Pressable>
	);
}

function controllerFixture(snapshot: AuthenticatedAppSessionStateSnapshot) {
	const subscribers = new Set<
		(next: AuthenticatedAppSessionStateSnapshot) => void
	>();
	const controller: jest.Mocked<AuthenticatedAppSessionController> = {
		activate: jest.fn(async (_activation) => undefined),
		dispose: jest.fn(async () => undefined),
		getSnapshot: jest.fn(() => snapshot),
		invalidateCurrentSession: jest.fn(async () => undefined),
		subscribe: jest.fn((subscriber) => {
			subscribers.add(subscriber);
			return {
				remove() {
					subscribers.delete(subscriber);
				},
			};
		}),
	};
	return controller;
}

function authFixture() {
	return {
		getToken: jest.fn(async () => "session-token"),
		getPowerSyncToken: jest.fn(async () => "powersync-token"),
		authReady: true,
		signedIn: true,
		signOut: jest.fn(async () => undefined),
	};
}

function appSessionFixture(): AuthenticatedAppSession {
	return {
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
		members: [
			{
				membershipId: "mbr_1",
				userId: "usr_1",
				role: "owner" as const,
				displayName: "Avery",
			},
		],
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

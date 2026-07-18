import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type { AuthenticatedAppSession } from "@/client/session";
import { HouseholdSettingsView } from "./household-settings-screen";
import { HouseholdSwitchView } from "./household-switch-screen";
import { MembersInvitationsView } from "./members-invitations-screen";
import type {
	HouseholdSettingsActions,
	HouseholdSettingsState,
} from "./use-household-settings";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock("@/client/session/powersync", () => ({
	PowerSyncConnector: jest.fn(),
	powerSyncAppDatabase: {},
	readPowerSyncUrl: jest.fn(() => "https://sync.test"),
}));

describe("HouseholdSwitchView", () => {
	it("switches Households by pressing the destination row", async () => {
		const onSwitchHousehold = jest.fn();
		await render(
			<HouseholdSwitchView
				session={sessionFixture()}
				state={{
					code: "",
					householdName: "",
					notice: null,
					operation: { status: "idle" },
				}}
				onCodeChange={jest.fn()}
				onHouseholdNameChange={jest.fn()}
				onCreateHousehold={jest.fn()}
				onJoinByCode={jest.fn()}
				onSwitchHousehold={onSwitchHousehold}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		expect(
			screen.getByRole("button", { name: "Open navigation" }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Avery" }).props.accessibilityState,
		).toMatchObject({ selected: true, disabled: true });
		await fireEvent.press(screen.getByRole("button", { name: "River" }));

		expect(onSwitchHousehold).toHaveBeenCalledWith("hh_river");
	});
});

describe("HouseholdSettingsView", () => {
	beforeEach(() => mockPush.mockReset());

	it("renders shared navigation chrome", async () => {
		await render(
			<HouseholdSettingsView
				session={sessionFixture()}
				state={{ status: "loading" }}
				actions={settingsActionsFixture()}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		expect(
			screen.getByRole("button", { name: "Open navigation" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
	});

	it("keeps Household controls separate from Member management", async () => {
		await render(
			<HouseholdSettingsView
				session={sessionFixture()}
				state={settingsReadyFixture()}
				actions={settingsActionsFixture()}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		expect(screen.getByText("Household Details")).toBeTruthy();
		expect(screen.getByText("Your Membership")).toBeTruthy();
		expect(screen.queryByText("Invite People")).toBeNull();

		await fireEvent.press(
			screen.getByRole("button", { name: "Members & Invitations" }),
		);
		expect(mockPush).toHaveBeenCalledWith("/household/members");
	});
});

describe("MembersInvitationsView", () => {
	it("renders Members, Invitation creation, Join Code, and pending Invitations", async () => {
		await render(
			<MembersInvitationsView
				session={sessionFixture()}
				state={settingsReadyFixture()}
				actions={settingsActionsFixture()}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		expect(screen.getByText("Members")).toBeTruthy();
		expect(screen.getAllByText("Avery").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText("Invite People")).toBeTruthy();
		expect(screen.getByLabelText("Invitation email")).toBeTruthy();
		expect(screen.getByText("Household Join Code")).toBeTruthy();
		expect(screen.getByText("Pending")).toBeTruthy();
		expect(screen.getByText("jordan@example.com")).toBeTruthy();
	});
});

function TestAppShellProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<NavigationDrawerProvider open={jest.fn()}>
				{children}
			</NavigationDrawerProvider>
		</SafeAreaProvider>
	);
}

function settingsActionsFixture(): HouseholdSettingsActions {
	return {
		retry: jest.fn(),
		renameHousehold: jest.fn(async () => false),
		createInvitation: jest.fn(async () => undefined),
		revokeInvitation: jest.fn(async () => undefined),
		removeMember: jest.fn(async () => undefined),
		setMemberRole: jest.fn(async () => undefined),
		leaveHousehold: jest.fn(async () => undefined),
		regenerateJoinCode: jest.fn(async () => undefined),
		setJoinCodeEnabled: jest.fn(async () => undefined),
		copyText: jest.fn(async () => undefined),
		clearNotice: jest.fn(),
	};
}

function settingsReadyFixture(): HouseholdSettingsState {
	return {
		status: "ready",
		members: [
			{
				membershipId: "mbr_1",
				userId: "usr_1",
				role: "owner",
				displayName: "Avery",
			},
		],
		invitations: [
			{
				id: "inv_1",
				householdId: "hh_avery",
				email: "jordan@example.com",
				createdByUserId: "usr_1",
				creatorDisplayName: "Avery",
				createdAt: 1,
				expiresAt: Date.UTC(2026, 6, 23),
				acceptUrl: "https://example.com/invitations/inv_1",
			},
		],
		joinCode: {
			enabled: true,
			id: "join_1",
			householdId: "hh_avery",
			code: "Q7K9M4P2",
			joinUrl: "https://example.com/households/join/Q7K9M4P2",
			createdAt: 1,
		},
		renamedHouseholdName: null,
		notice: null,
		operation: { status: "idle" },
	};
}

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_1",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: null,
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
			{ id: "hh_river", name: "River", role: "member", isActive: false },
		],
		activeMember: {
			id: "mbr_1",
			userId: "usr_1",
			role: "owner",
			displayName: "Avery",
		},
		members: [],
	};
}

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@mobile/app-shell/navigation-drawer-context";
import type {
	HouseholdSettingsActions,
	HouseholdSettingsState,
} from "@mobile/features/household/use-household-settings";
import type { AuthenticatedAppSession } from "@mobile/session";
import { HouseholdSettingsView } from "./household-settings-screen";
import { HouseholdSwitchView } from "./household-switch-screen";
import { MembersInvitationsView } from "./members-invitations-screen";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock("@mobile/session/powersync", () => ({
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

	it("keeps an empty Household Join Code on the field instead of joining", async () => {
		const onJoinByCode = jest.fn();
		await render(
			<HouseholdSwitchView
				session={sessionFixture()}
				state={{
					code: "",
					householdName: "",
					operation: { status: "idle" },
				}}
				onCodeChange={jest.fn()}
				onHouseholdNameChange={jest.fn()}
				onCreateHousehold={jest.fn()}
				onJoinByCode={onJoinByCode}
				onSwitchHousehold={jest.fn()}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		await fireEvent.press(
			screen.getByRole("button", { name: "Join with Code" }),
		);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Join Household" }),
		);

		expect(screen.getByText("Enter a Household Join Code.")).toBeTruthy();
		expect(onJoinByCode).not.toHaveBeenCalled();
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

	it("exposes whether the Household Join Code actions are expanded", async () => {
		await render(
			<MembersInvitationsView
				session={sessionFixture()}
				state={settingsReadyFixture()}
				actions={settingsActionsFixture()}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		const joinCodeToggle = screen.getByRole("button", {
			name: "Household Join Code",
		});
		expect(joinCodeToggle).toHaveStyle({ minHeight: 56 });
		expect(joinCodeToggle.props.accessibilityState).toMatchObject({
			expanded: false,
		});
		expect(screen.queryByRole("button", { name: "Copy Link" })).toBeNull();

		await fireEvent.press(joinCodeToggle);

		expect(
			screen.getByRole("button", { name: "Household Join Code" }).props
				.accessibilityState,
		).toMatchObject({ expanded: true });
		expect(screen.getByRole("button", { name: "Copy Link" })).toBeTruthy();
	});

	it("keeps an invalid Invitation email on the field instead of sending it", async () => {
		const actions = settingsActionsFixture();
		await render(
			<MembersInvitationsView
				session={sessionFixture()}
				state={settingsReadyFixture()}
				actions={actions}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		await fireEvent(
			screen.getByLabelText("Invitation email"),
			"textChange",
			"not-an-email",
		);
		await fireEvent.press(screen.getByRole("button", { name: "Send Invite" }));

		expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
		expect(actions.createInvitation).not.toHaveBeenCalled();

		await fireEvent(
			screen.getByLabelText("Invitation email"),
			"textChange",
			"jordan@example.com",
		);
		await fireEvent.press(screen.getByRole("button", { name: "Send Invite" }));

		expect(actions.createInvitation).toHaveBeenCalledWith("jordan@example.com");
		expect(screen.queryByText("Enter a valid email address.")).toBeNull();
	});

	it("uses native action menus for manageable Members and Invitations", async () => {
		const actions = settingsActionsFixture();
		const state = settingsReadyFixture();
		state.members.push({
			membershipId: "mbr_2",
			userId: "usr_2",
			role: "member",
			displayName: "Jordan",
		});
		await render(
			<MembersInvitationsView
				session={sessionFixture()}
				state={state}
				actions={actions}
			/>,
			{ wrapper: TestAppShellProvider },
		);

		await fireEvent.press(
			screen.getByRole("button", { name: "Manage Jordan" }),
		);
		expect(
			await screen.findByRole("button", { name: "Make Owner" }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Remove Member" })).toBeTruthy();

		await fireEvent.press(
			screen.getByRole("button", {
				name: "Manage jordan@example.com",
			}),
		);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Copy Invitation" }),
		);
		expect(actions.copyText).toHaveBeenCalledWith(
			"https://example.com/invitations/inv_1",
			"Invitation copied.",
		);
		expect(
			screen.getByRole("button", { name: "Revoke Invitation" }),
		).toBeTruthy();
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
	};
}

function settingsReadyFixture(): Extract<
	HouseholdSettingsState,
	{ status: "ready" }
> {
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

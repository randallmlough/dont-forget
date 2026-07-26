import type { Meta, StoryObj } from "@storybook/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type {
	HouseholdSettingsActions,
	HouseholdSettingsState,
} from "@/client/features/household/use-household-settings";
import type { AuthenticatedAppSession } from "@/client/session";
import { HouseholdSettingsView } from "./household-settings-screen";
import { HouseholdSwitchView } from "./household-switch-screen";
import { MembersInvitationsView } from "./members-invitations-screen";

const meta = {
	title: "screens/app/household/HouseholdPages",
	decorators: [
		(Story) => (
			<SafeAreaProvider
				initialMetrics={{
					frame: { x: 0, y: 0, width: 390, height: 844 },
					insets: { top: 47, left: 0, right: 0, bottom: 34 },
				}}
			>
				<NavigationDrawerProvider open={noop}>
					<Story />
				</NavigationDrawerProvider>
			</SafeAreaProvider>
		),
	],
	parameters: { noSafeArea: true },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const HouseholdReady: Story = {
	render: () => (
		<HouseholdSettingsView
			actions={actionsFixture}
			session={sessionFixture}
			state={readyStateFixture}
		/>
	),
};

export const HouseholdLoading: Story = {
	render: () => (
		<HouseholdSettingsView
			actions={actionsFixture}
			session={sessionFixture}
			state={{ status: "loading" }}
		/>
	),
};

export const MembersAndInvitations: Story = {
	render: () => (
		<MembersInvitationsView
			actions={actionsFixture}
			session={sessionFixture}
			state={readyStateFixture}
		/>
	),
};

export const MembersEmpty: Story = {
	render: () => (
		<MembersInvitationsView
			actions={actionsFixture}
			session={sessionFixture}
			state={{
				...readyStateFixture,
				members: [],
				invitations: [],
			}}
		/>
	),
};

export const SwitchHousehold: Story = {
	render: () => (
		<HouseholdSwitchView
			onCodeChange={noopString}
			onCreateHousehold={noop}
			onHouseholdNameChange={noopString}
			onJoinByCode={noop}
			onSwitchHousehold={noopString}
			session={sessionFixture}
			state={{
				code: "",
				householdName: "",
				operation: { status: "idle" },
			}}
		/>
	),
};

const sessionFixture: AuthenticatedAppSession = {
	user: {
		id: "usr_avery",
		email: "avery@example.com",
		displayName: "Avery Chen",
		firstName: "Avery",
		lastName: "Chen",
	},
	activeHousehold: { id: "hh_avery", name: "Avery Household" },
	households: [
		{
			id: "hh_avery",
			name: "Avery Household",
			role: "owner",
			isActive: true,
		},
		{ id: "hh_lake", name: "Lake House", role: "member", isActive: false },
		{
			id: "hh_studio",
			name: "Studio Kitchen",
			role: "owner",
			isActive: false,
		},
	],
	activeMember: {
		id: "mbr_avery",
		userId: "usr_avery",
		role: "owner",
		displayName: "Avery Chen",
	},
	members: [],
};

const readyStateFixture: Extract<HouseholdSettingsState, { status: "ready" }> =
	{
		status: "ready",
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
			{
				membershipId: "mbr_jordan",
				userId: "usr_jordan",
				role: "member",
				displayName: "Jordan Lee",
			},
			{
				membershipId: "mbr_mia",
				userId: "usr_mia",
				role: "member",
				displayName: "Mia Patel",
			},
		],
		invitations: [
			{
				id: "inv_alex",
				householdId: "hh_avery",
				email: "alex@example.com",
				createdByUserId: "usr_avery",
				creatorDisplayName: "Avery Chen",
				createdAt: Date.UTC(2026, 6, 16),
				expiresAt: Date.UTC(2026, 6, 23),
				acceptUrl: "https://example.com/invitations/inv_alex",
			},
		],
		joinCode: {
			enabled: true,
			id: "join_avery",
			householdId: "hh_avery",
			code: "Q7K9M4P2",
			joinUrl: "https://example.com/households/join/Q7K9M4P2",
			createdAt: Date.UTC(2026, 6, 16),
		},
		renamedHouseholdName: null,
		operation: { status: "idle" },
	};

const actionsFixture: HouseholdSettingsActions = {
	retry: noop,
	renameHousehold: async () => false,
	createInvitation: async () => undefined,
	revokeInvitation: async () => undefined,
	removeMember: async () => undefined,
	setMemberRole: async () => undefined,
	leaveHousehold: async () => undefined,
	regenerateJoinCode: async () => undefined,
	setJoinCodeEnabled: async () => undefined,
	copyText: async () => undefined,
};

function noop() {}
function noopString(_value: string) {}

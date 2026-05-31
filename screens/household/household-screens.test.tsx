import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { HouseholdApiClient } from "@/lib/client-api/households";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HouseholdSettingsView } from "./household-settings-screen";
import { HouseholdSwitchView } from "./household-switch-screen";
import { PublicHouseholdEntryView } from "./public-household-entry-screen";
import { useHouseholdSwitch } from "./use-household-switch";
import { usePublicHouseholdEntry } from "./use-public-household-entry";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockReloadSession = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
	useAuth: () => ({ getToken: jest.fn(async () => "token") }),
}));

jest.mock("@/components/session", () => ({
	AuthenticatedAppSessionProvider: ({ children }: { children: ReactNode }) =>
		children,
	useAuthenticatedAppSession: () => ({
		reloadSession: mockReloadSession,
	}),
}));

jest.mock("expo-router", () => ({
	useLocalSearchParams: () => ({}),
	useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

beforeEach(() => {
	mockReplace.mockReset();
	mockPush.mockReset();
	mockReloadSession.mockReset();
});

describe("HouseholdSettingsView", () => {
	it("renders Members, pending Invitations, and enabled Household Join Code controls", () => {
		const actions = settingsActions();

		render(
			<HouseholdSettingsView
				session={sessionFixture()}
				state={{
					status: "ready",
					members: [
						{
							membershipId: "mbr_1",
							userId: "usr_1",
							role: "owner",
							displayName: "Avery Chen",
						},
					],
					invitations: [
						{
							id: "inv_1",
							householdId: "hh_1",
							email: "pending@example.com",
							createdByUserId: "usr_1",
							creatorDisplayName: "Avery Chen",
							createdAt: 1,
							expiresAt: 1_800_000_000_000,
							acceptUrl: "https://app.example/invitations/accept?token=secret",
						},
					],
					joinCode: {
						enabled: true,
						id: "hjc_1",
						householdId: "hh_1",
						code: "ABCDEFGH",
						joinUrl: "https://app.example/households/join?code=ABCDEFGH",
						createdAt: 1,
					},
					notice: null,
					working: null,
				}}
				actions={actions}
			/>,
		);

		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("pending@example.com")).toBeTruthy();
		expect(screen.getByText("ABCDEFGH")).toBeTruthy();
		fireEvent.press(screen.getByText("Copy link"));
		expect(actions.copyText).toHaveBeenCalledWith(
			"https://app.example/households/join?code=ABCDEFGH",
			"Household join link copied.",
		);
	});
});

describe("HouseholdSwitch", () => {
	it("renders the active Household badge", () => {
		render(
			<HouseholdSwitchView
				session={sessionFixture()}
				state={{ code: "", notice: null, working: null }}
				onCodeChange={jest.fn()}
				onJoinByCode={jest.fn()}
				onSwitchHousehold={jest.fn()}
			/>,
		);

		expect(screen.getByText("Current")).toBeTruthy();
		expect(screen.getByText("Lake House")).toBeTruthy();
	});

	it("keeps the current Household when sync-before-switch fails", async () => {
		const session = sessionFixture();
		const switchHousehold = jest.fn(async () => undefined);
		session.services.sync.requestSync = jest.fn(async () => {
			throw new Error("sync failed");
		});

		function Harness() {
			const model = useHouseholdSwitch(session, jest.fn(), {
				...emptyClient(),
				switchHousehold,
			});
			return (
				<>
					<PressableText
						label="Switch"
						onPress={() => model.switchHousehold("hh_2")}
					/>
					{model.state.notice ? (
						<TextNode>{model.state.notice}</TextNode>
					) : null}
				</>
			);
		}

		render(<Harness />);
		fireEvent.press(screen.getByText("Switch"));

		await waitFor(() =>
			expect(
				screen.getByText(
					"Unable to sync this Household before switching. Try again.",
				),
			).toBeTruthy(),
		);
		expect(switchHousehold).not.toHaveBeenCalled();
		expect(session.services.sync.requestSync).toHaveBeenCalledWith({
			reason: "manualRefresh",
		});
	});
});

describe("PublicHouseholdEntry", () => {
	it("does not render invitee email, Member list, visible token, or code", () => {
		render(
			<PublicHouseholdEntryView
				state={{
					status: "ready",
					kind: "invitation",
					householdName: "River House",
					inviterDisplayName: "Avery",
					working: false,
					error: null,
				}}
				primaryLabel="Accept Invitation"
				onSubmit={jest.fn()}
			/>,
		);

		expect(screen.getByText("River House")).toBeTruthy();
		expect(screen.getByText(/Avery invited you/)).toBeTruthy();
		expect(screen.queryByText("pending@example.com")).toBeNull();
		expect(screen.queryByText("ABCDEFGH")).toBeNull();
		expect(screen.queryByText("secret-token")).toBeNull();
		expect(screen.queryByText("Blake Rivera")).toBeNull();
	});

	it("accepts an Invitation and routes to Home", async () => {
		const acceptInvitation = jest.fn(async () => undefined);
		let resolvePreview: (
			preview: Awaited<ReturnType<HouseholdApiClient["previewInvitation"]>>,
		) => void = () => undefined;
		const previewInvitation = jest.fn(
			() =>
				new Promise<
					Awaited<ReturnType<HouseholdApiClient["previewInvitation"]>>
				>((resolve) => {
					resolvePreview = resolve;
				}),
		);

		function Harness() {
			const entry = usePublicHouseholdEntry({
				kind: "invitation",
				secret: "secret-token",
				client: {
					...emptyClient(),
					previewInvitation,
					acceptInvitation,
				},
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Accept Invitation"
					onSubmit={entry.submit}
				/>
			);
		}

		render(<Harness />);
		await act(async () => {
			resolvePreview({
				available: true,
				householdName: "River House",
				inviterDisplayName: "Avery",
			});
		});
		await screen.findByText("River House");
		fireEvent.press(screen.getByText("Accept Invitation"));

		await waitFor(() =>
			expect(acceptInvitation).toHaveBeenCalledWith("secret-token"),
		);
		await waitFor(() => expect(mockReloadSession).toHaveBeenCalledTimes(1));
		expect(mockReplace).toHaveBeenCalledWith("/");
	});
});

function sessionFixture(): AuthenticatedAppSession {
	const lists: AuthenticatedAppSession["services"]["lists"] = {
		getList: jest.fn(),
	};
	const items: AuthenticatedAppSession["services"]["items"] = {
		listItems: jest.fn(),
		addItem: jest.fn(),
		setItemChecked: jest.fn(),
	};
	return {
		user: { id: "usr_1", email: "avery@example.com", displayName: "Avery" },
		activeHousehold: { id: "hh_1", name: "River House" },
		households: [
			{ id: "hh_1", name: "River House", role: "owner", isActive: true },
			{ id: "hh_2", name: "Lake House", role: "member", isActive: false },
		],
		activeMember: {
			id: "mbr_1",
			userId: "usr_1",
			role: "owner",
			displayName: "Avery",
		},
		members: [],
		resourceKey: "authenticated-app-session:1",
		services: {
			lists,
			items,
			sync: {
				getStatus: jest.fn(() => "synced"),
				subscribe: jest.fn(() => ({ remove() {} })),
				requestSync: jest.fn(async () => ({ changed: false })),
			},
		},
	};
}

function settingsActions() {
	return {
		retry: jest.fn(),
		createInvitation: jest.fn(),
		revokeInvitation: jest.fn(),
		regenerateJoinCode: jest.fn(),
		setJoinCodeEnabled: jest.fn(),
		copyText: jest.fn(),
		clearNotice: jest.fn(),
	};
}

function emptyClient(): HouseholdApiClient {
	return {
		listMembers: jest.fn(),
		listInvitations: jest.fn(),
		createInvitation: jest.fn(),
		revokeInvitation: jest.fn(),
		getJoinCode: jest.fn(),
		regenerateJoinCode: jest.fn(),
		setJoinCodeEnabled: jest.fn(),
		switchHousehold: jest.fn(),
		previewInvitation: jest.fn(),
		acceptInvitation: jest.fn(),
		previewJoinCode: jest.fn(),
		joinByCode: jest.fn(),
	};
}

function PressableText({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) {
	const { Pressable, Text } =
		jest.requireActual<typeof import("react-native")>("react-native");
	return (
		<Pressable accessibilityRole="button" onPress={onPress}>
			<Text>{label}</Text>
		</Pressable>
	);
}

function TextNode({ children }: { children: ReactNode }) {
	const { Text } =
		jest.requireActual<typeof import("react-native")>("react-native");
	return <Text>{children}</Text>;
}

import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import type {
	AuthenticatedAppSessionContextValue,
	AuthenticatedAppSessionReloadOptions,
} from "@/components/session";
import { track } from "@/lib/analytics";
import type {
	HouseholdApiClient,
	HouseholdMember,
} from "@/lib/client-api/households";
import { JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE } from "@/lib/household-join-code-source";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { HouseholdSettingsView } from "./household-settings-screen";
import HouseholdSwitchScreen, {
	HouseholdSwitchView,
} from "./household-switch-screen";
import { PublicHouseholdEntryView } from "./public-household-entry-screen";
import { useHouseholdSettings } from "./use-household-settings";
import { useHouseholdSwitch } from "./use-household-switch";
import { usePublicHouseholdEntry } from "./use-public-household-entry";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockReloadSession = jest.fn();
const mockRetrySession = jest.fn();
let mockIsSignedIn: boolean | undefined = true;
let mockAuthenticatedAppSession: AuthenticatedAppSessionContextValue;

jest.mock("@clerk/clerk-expo", () => ({
	useAuth: () => ({
		getToken: jest.fn(async () => "token"),
		isSignedIn: mockIsSignedIn,
	}),
}));

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: { extra: { apiBaseUrl: "https://api.example" } } },
}));

jest.mock("@/components/session", () => ({
	AuthenticatedAppSessionProvider: ({ children }: { children: ReactNode }) =>
		children,
	useAuthenticatedAppSession: () => mockAuthenticatedAppSession,
}));

jest.mock("expo-router", () => ({
	useLocalSearchParams: () => ({}),
	useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("@/lib/analytics", () => ({
	track: jest.fn(),
}));

beforeEach(() => {
	jest.mocked(track).mockClear();
	mockReplace.mockReset();
	mockPush.mockReset();
	mockReloadSession.mockReset();
	mockRetrySession.mockReset();
	mockIsSignedIn = true;
	mockAuthenticatedAppSession = {
		state: { status: "ready", refreshing: false },
		session: sessionFixture(),
		retry: mockRetrySession,
		reloadSession: mockReloadSession,
		signOut: jest.fn(async () => undefined),
	};
});

describe("HouseholdSettingsView", () => {
	it("renders Members, pending Invitations, and enabled Household Join Code controls", async () => {
		const actions = settingsActions();

		await render(
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
					renamedHouseholdName: null,
					operation: { status: "idle" },
				}}
				actions={actions}
			/>,
		);

		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("pending@example.com")).toBeTruthy();
		expect(screen.getByText("ABCD EFGH")).toBeTruthy();
		await fireEvent.press(screen.getByText("Copy link"));
		expect(actions.copyText).toHaveBeenCalledWith(
			"https://app.example/households/join?code=ABCDEFGH",
			"Household join link copied.",
		);
	});

	it("shows Member management actions to Owners for other Members", async () => {
		await render(
			<HouseholdSettingsView
				session={sessionFixture()}
				state={readySettingsState([
					{
						membershipId: "mbr_1",
						userId: "usr_1",
						role: "owner",
						displayName: "Avery Chen",
					},
					{
						membershipId: "mbr_2",
						userId: "usr_2",
						role: "member",
						displayName: "Blake Rivera",
					},
				])}
				actions={settingsActions()}
			/>,
		);

		expect(screen.getByText("Make Owner")).toBeTruthy();
		expect(screen.getByText("Remove")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Make Blake Rivera an Owner" }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", {
				name: "Remove Blake Rivera from this Household",
			}),
		).toBeTruthy();
		expect(screen.getByText("Leave Household")).toBeTruthy();
	});

	it("renames Households from the Owner-only rename form", async () => {
		const actions = settingsActions();

		await render(
			<HouseholdSettingsView
				session={sessionFixture()}
				state={readySettingsState([])}
				actions={actions}
			/>,
		);

		await fireEvent.press(screen.getByText("Rename"));
		await fireEvent.changeText(
			screen.getByLabelText("Household name"),
			"Lake House",
		);
		await fireEvent.press(screen.getByText("Rename"));

		expect(actions.renameHousehold).toHaveBeenCalledWith("Lake House");
	});

	it("keeps the Household rename form open when save fails", async () => {
		const client = readySettingsClient({
			renameHousehold: jest.fn(async () => {
				throw new Error("Household name is required.");
			}),
		});

		function Harness() {
			const settings = useHouseholdSettings(sessionFixture(), client);
			return (
				<HouseholdSettingsView
					session={sessionFixture()}
					state={settings.state}
					actions={settings.actions}
				/>
			);
		}

		await render(<Harness />);
		await screen.findByText("Rename");

		await fireEvent.press(screen.getByText("Rename"));
		await fireEvent.changeText(screen.getByLabelText("Household name"), "   ");
		await fireEvent.press(screen.getByText("Rename"));

		await screen.findByText("Household name is required.");
		expect(screen.getByLabelText("Household name").props.value).toBe("   ");
	});

	it("uses refreshed session metadata after settings remount", async () => {
		const session = {
			...sessionFixture(),
			activeHousehold: { id: "hh_1", name: "Silver Spoon PR117 QA" },
			households: [
				{
					id: "hh_1",
					name: "Silver Spoon PR117 QA",
					role: "owner" as const,
					isActive: true,
				},
			],
		};

		await render(
			<HouseholdSettingsView
				session={session}
				state={readySettingsState([])}
				actions={settingsActions()}
			/>,
		);

		expect(screen.getAllByText("Silver Spoon PR117 QA").length).toBeGreaterThan(
			0,
		);
	});

	it("hides Member management actions from plain Members", async () => {
		const session = {
			...sessionFixture(),
			activeMember: {
				id: "mbr_1",
				userId: "usr_1",
				role: "member" as const,
				displayName: "Avery",
			},
		};

		await render(
			<HouseholdSettingsView
				session={session}
				state={readySettingsState([
					{
						membershipId: "mbr_2",
						userId: "usr_2",
						role: "member",
						displayName: "Blake Rivera",
					},
				])}
				actions={settingsActions()}
			/>,
		);

		expect(screen.queryByText("Make Owner")).toBeNull();
		expect(screen.queryByText("Remove")).toBeNull();
		expect(screen.getByText("Leave Household")).toBeTruthy();
	});

	it("hides the Household rename affordance from plain Members", async () => {
		const session = {
			...sessionFixture(),
			activeMember: {
				id: "mbr_1",
				userId: "usr_1",
				role: "member" as const,
				displayName: "Avery",
			},
		};

		await render(
			<HouseholdSettingsView
				session={session}
				state={readySettingsState([])}
				actions={settingsActions()}
			/>,
		);

		expect(screen.queryByText("Rename")).toBeNull();
	});

	it("shows the Household delete affordance only to Owners", async () => {
		const memberSession = {
			...sessionFixture(),
			activeMember: {
				id: "mbr_1",
				userId: "usr_1",
				role: "member" as const,
				displayName: "Avery",
			},
		};
		const { rerender } = await render(
			<HouseholdSettingsView
				session={memberSession}
				state={readySettingsState([])}
				actions={settingsActions()}
			/>,
		);

		expect(screen.queryByText("Delete Household")).toBeNull();

		await rerender(
			<HouseholdSettingsView
				session={sessionFixture()}
				state={readySettingsState([])}
				actions={settingsActions()}
			/>,
		);

		expect(screen.getByText("Delete Household")).toBeTruthy();
	});

	it("confirms before deleting a Household", async () => {
		const alert = jest
			.spyOn(Alert, "alert")
			.mockImplementation(() => undefined);
		const actions = settingsActions();
		try {
			await render(
				<HouseholdSettingsView
					session={sessionFixture()}
					state={readySettingsState([])}
					actions={actions}
				/>,
			);

			await fireEvent.press(screen.getByText("Delete"));

			expect(alert).toHaveBeenCalledWith(
				"Delete Household",
				"This permanently deletes the Household and its Lists for every Member. This cannot be undone.",
				expect.arrayContaining([
					expect.objectContaining({ text: "Cancel" }),
					expect.objectContaining({
						text: "Delete Household",
						style: "destructive",
					}),
				]),
			);
			const buttons = alert.mock.calls[0]?.[2];
			if (!Array.isArray(buttons)) throw new Error("Expected Alert buttons");

			buttons[0]?.onPress?.();
			expect(actions.deleteHousehold).not.toHaveBeenCalled();
			buttons[1]?.onPress?.();
			expect(actions.deleteHousehold).toHaveBeenCalledTimes(1);
		} finally {
			alert.mockRestore();
		}
	});

	it("confirms before leaving a Household", async () => {
		const alert = jest
			.spyOn(Alert, "alert")
			.mockImplementation(() => undefined);
		try {
			await render(
				<HouseholdSettingsView
					session={sessionFixture()}
					state={readySettingsState([
						{
							membershipId: "mbr_1",
							userId: "usr_1",
							role: "owner",
							displayName: "Avery Chen",
						},
					])}
					actions={settingsActions()}
				/>,
			);

			await fireEvent.press(screen.getByText("Leave"));

			expect(alert).toHaveBeenCalledWith(
				"Leave Household",
				"Leave this Household and remove your Membership?",
				expect.arrayContaining([
					expect.objectContaining({ text: "Cancel" }),
					expect.objectContaining({ text: "Leave" }),
				]),
			);
		} finally {
			alert.mockRestore();
		}
	});
});

describe("useHouseholdSettings", () => {
	it("does not restart the initial load when the auth token getter changes identity", async () => {
		const fetcher = jest
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input) => {
				const url = String(input);
				let body: unknown;
				if (url.endsWith("/api/households/hh_1/members")) {
					body = { members: [] };
				} else if (url.endsWith("/api/households/hh_1/invitations")) {
					body = { invitations: [] };
				} else if (url.endsWith("/api/households/hh_1/join-code")) {
					body = { joinCode: { enabled: false, householdId: "hh_1" } };
				} else {
					throw new Error(`Unexpected request: ${url}`);
				}

				return jsonResponse(body);
			});

		function Harness() {
			const { state } = useHouseholdSettings(sessionFixture());
			return <TextNode>{state.status}</TextNode>;
		}

		await render(<Harness />);

		await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it("loads settings after the Authenticated App Session resource key changes", async () => {
		const freshMembers = [
			{
				membershipId: "mbr_fresh",
				userId: "usr_1",
				role: "owner" as const,
				displayName: "Fresh Member",
			},
		];
		const firstLoad = {
			members:
				deferred<Awaited<ReturnType<HouseholdApiClient["listMembers"]>>>(),
			invitations:
				deferred<Awaited<ReturnType<HouseholdApiClient["listInvitations"]>>>(),
			joinCode:
				deferred<Awaited<ReturnType<HouseholdApiClient["getJoinCode"]>>>(),
		};
		const client = {
			...emptyClient(),
			listMembers: jest
				.fn()
				.mockReturnValueOnce(firstLoad.members.promise)
				.mockResolvedValueOnce(freshMembers),
			listInvitations: jest
				.fn()
				.mockReturnValueOnce(firstLoad.invitations.promise)
				.mockResolvedValueOnce([]),
			getJoinCode: jest
				.fn()
				.mockReturnValueOnce(firstLoad.joinCode.promise)
				.mockResolvedValueOnce({ enabled: false, householdId: "hh_1" }),
		};

		function Harness({ session }: { session: AuthenticatedAppSession }) {
			const { state } = useHouseholdSettings(session, client);
			return (
				<TextNode>
					{state.status === "ready"
						? state.members[0]?.displayName
						: state.status}
				</TextNode>
			);
		}

		const cachedSession = sessionFixture();
		const { rerender } = await render(<Harness session={cachedSession} />);
		expect(screen.getByText("loading")).toBeTruthy();

		await rerender(
			<Harness
				session={{
					...cachedSession,
					resourceKey: "authenticated-app-session:2",
				}}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Fresh Member")).toBeTruthy());
	});

	it("does not start a second settings operation while one is running", async () => {
		const createInvitation =
			deferred<Awaited<ReturnType<HouseholdApiClient["createInvitation"]>>>();
		const client = {
			...emptyClient(),
			listMembers: jest.fn(async () => []),
			listInvitations: jest.fn(async () => []),
			getJoinCode: jest.fn(async () => ({
				enabled: true,
				id: "hjc_1",
				householdId: "hh_1",
				code: "ABCDEFGH",
				joinUrl: "https://app.example/households/join?code=ABCDEFGH",
				createdAt: 1,
			})),
			createInvitation: jest.fn(() => createInvitation.promise),
			regenerateJoinCode: jest.fn(async () => ({
				enabled: true,
				id: "hjc_2",
				householdId: "hh_1",
				code: "IJKLMNOP",
				joinUrl: "https://app.example/households/join?code=IJKLMNOP",
				createdAt: 2,
			})),
		};

		function Harness() {
			const { state, actions } = useHouseholdSettings(sessionFixture(), client);
			if (state.status !== "ready") return <TextNode>{state.status}</TextNode>;
			return (
				<>
					<PressableText
						label="Create"
						onPress={() => void actions.createInvitation("pending@example.com")}
					/>
					<PressableText
						label="Regenerate"
						onPress={() => void actions.regenerateJoinCode()}
					/>
					<TextNode>{state.operation.status}</TextNode>
				</>
			);
		}

		await render(<Harness />);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Create"));
		await screen.findByText("creatingInvitation");
		await fireEvent.press(screen.getByText("Regenerate"));

		expect(client.regenerateJoinCode).not.toHaveBeenCalled();
		await act(async () => {
			createInvitation.resolve({
				invitation: {
					id: "inv_1",
					householdId: "hh_1",
					email: "pending@example.com",
					createdByUserId: "usr_1",
					createdAt: 1,
					expiresAt: 2,
					acceptedAt: null,
					acceptedByUserId: null,
					revokedAt: null,
					acceptUrl: "https://app.example/invitations/accept?token=secret",
				},
				emailDelivery: { status: "sent" },
				reusedExisting: false,
			});
		});
		await screen.findByText("idle");
	});

	it("starts an operation when settings first become ready", async () => {
		const client = {
			...emptyClient(),
			listMembers: jest.fn(async () => []),
			listInvitations: jest.fn(async () => []),
			getJoinCode: jest.fn(async () => ({
				enabled: false as const,
				householdId: "hh_1",
			})),
			createInvitation: jest.fn(async () => ({
				invitation: {
					id: "inv_1",
					householdId: "hh_1",
					email: "pending@example.com",
					createdByUserId: "usr_1",
					createdAt: 1,
					expiresAt: 2,
					acceptedAt: null,
					acceptedByUserId: null,
					revokedAt: null,
					acceptUrl: "https://app.example/invitations/accept?token=secret",
				},
				emailDelivery: { status: "sent" as const },
				reusedExisting: false,
			})),
		};

		function CreateWhenReady({
			state,
			actions,
		}: ReturnType<typeof useHouseholdSettings>) {
			const startedRef = useRef(false);
			useLayoutEffect(() => {
				if (
					!startedRef.current &&
					state.status === "ready" &&
					state.operation.status === "idle"
				) {
					startedRef.current = true;
					void actions.createInvitation("pending@example.com");
				}
			}, [state, actions]);

			return <TextNode>{state.status}</TextNode>;
		}

		function Harness() {
			const settings = useHouseholdSettings(sessionFixture(), client);
			return <CreateWhenReady {...settings} />;
		}

		await render(<Harness />);

		await waitFor(() =>
			expect(client.createInvitation).toHaveBeenCalledWith({
				householdId: "hh_1",
				email: "pending@example.com",
			}),
		);
	});

	it("does not create an emailed Invitation from invalid email text", async () => {
		const client = {
			...emptyClient(),
			listMembers: jest.fn(async () => []),
			listInvitations: jest.fn(async () => []),
			getJoinCode: jest.fn(async () => ({
				enabled: false as const,
				householdId: "hh_1",
			})),
			createInvitation: jest.fn(async () => ({
				invitation: {
					id: "inv_1",
					householdId: "hh_1",
					email: "not-an-email",
					createdByUserId: "usr_1",
					createdAt: 1,
					expiresAt: 2,
					acceptedAt: null,
					acceptedByUserId: null,
					revokedAt: null,
					acceptUrl: "https://app.example/invitations/accept?token=secret",
				},
				emailDelivery: { status: "sent" as const },
				reusedExisting: false,
			})),
		};

		function Harness() {
			const { state, actions } = useHouseholdSettings(sessionFixture(), client);
			if (state.status !== "ready") return <TextNode>{state.status}</TextNode>;
			return (
				<>
					<PressableText
						label="Create"
						onPress={() =>
							void actions.createInvitation("qa-hh-join-20260601-0105")
						}
					/>
					{state.notice ? <TextNode>{state.notice}</TextNode> : null}
				</>
			);
		}

		await render(<Harness />);
		await screen.findByText("Create");

		await fireEvent.press(screen.getByText("Create"));

		await screen.findByText("Enter a valid email address.");
		expect(client.createInvitation).not.toHaveBeenCalled();
	});

	it("removes a Member, refreshes Members, and reloads the session", async () => {
		const reloadSession = jest.fn();
		const refreshedMembers = [
			{
				membershipId: "mbr_1",
				userId: "usr_1",
				role: "owner" as const,
				displayName: "Avery",
			},
		];
		const client = readySettingsClient({
			removeMember: jest.fn(async () => undefined),
			listMembers: jest
				.fn()
				.mockResolvedValueOnce([
					...refreshedMembers,
					{
						membershipId: "mbr_2",
						userId: "usr_2",
						role: "member" as const,
						displayName: "Blake",
					},
				])
				.mockResolvedValueOnce(refreshedMembers),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="remove"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Remove"));

		await screen.findByText("Member removed.");
		expect(client.removeMember).toHaveBeenCalledWith({
			householdId: "hh_1",
			membershipId: "mbr_2",
		});
		expect(screen.getByText("members:1")).toBeTruthy();
		expect(reloadSession).toHaveBeenCalledWith();
	});

	it("surfaces remove Member failures without refreshing Members", async () => {
		const client = readySettingsClient({
			removeMember: jest.fn(async () => {
				throw new Error("Cannot remove this Member.");
			}),
			listMembers: jest.fn(async () => [
				{
					membershipId: "mbr_2",
					userId: "usr_2",
					role: "member" as const,
					displayName: "Blake",
				},
			]),
		});

		await render(<SettingsActionHarness client={client} action="remove" />);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Remove"));

		await screen.findByText("Cannot remove this Member.");
		expect(client.listMembers).toHaveBeenCalledTimes(1);
	});

	it("changes a Member role, refreshes Members, and reloads the session", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			setMemberRole: jest.fn(async () => undefined),
			listMembers: jest
				.fn()
				.mockResolvedValueOnce([
					{
						membershipId: "mbr_2",
						userId: "usr_2",
						role: "member" as const,
						displayName: "Blake",
					},
				])
				.mockResolvedValueOnce([
					{
						membershipId: "mbr_2",
						userId: "usr_2",
						role: "owner" as const,
						displayName: "Blake",
					},
				]),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="role"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Change role"));

		await screen.findByText("Member role changed.");
		expect(client.setMemberRole).toHaveBeenCalledWith({
			householdId: "hh_1",
			membershipId: "mbr_2",
			role: "owner",
		});
		expect(screen.getByText("firstRole:owner")).toBeTruthy();
		expect(reloadSession).toHaveBeenCalledWith();
	});

	it("surfaces role-change failures without refreshing Members", async () => {
		const client = readySettingsClient({
			setMemberRole: jest.fn(async () => {
				throw new Error("A Household must have at least one Owner.");
			}),
			listMembers: jest.fn(async () => [
				{
					membershipId: "mbr_2",
					userId: "usr_2",
					role: "member" as const,
					displayName: "Blake",
				},
			]),
		});

		await render(<SettingsActionHarness client={client} action="role" />);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Change role"));

		await screen.findByText("A Household must have at least one Owner.");
		expect(client.listMembers).toHaveBeenCalledTimes(1);
	});

	it("renames a Household, surfaces the updated name, and reloads session metadata", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			renameHousehold: jest.fn(async () => ({
				id: "hh_1",
				name: "Lake House",
			})),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="rename"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Rename action"));

		await screen.findByText("Household renamed.");
		expect(client.renameHousehold).toHaveBeenCalledWith({
			householdId: "hh_1",
			name: "Lake House",
		});
		expect(screen.getByText("renamedHouseholdName:Lake House")).toBeTruthy();
		expect(reloadSession).toHaveBeenCalledWith({ mode: "freshOnly" });
	});

	it("keeps the rename success notice visible after the session metadata reload refreshes settings", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			renameHousehold: jest.fn(async () => ({
				id: "hh_1",
				name: "Lake House",
			})),
		});

		function Harness() {
			const [session, setSession] = useState(sessionFixture());
			const freshSession = {
				...sessionFixture(),
				activeHousehold: { id: "hh_1", name: "Lake House" },
				households: [
					{
						id: "hh_1",
						name: "Lake House",
						role: "owner" as const,
						isActive: true,
					},
				],
				resourceKey: "authenticated-app-session:2",
			};
			const { state, actions } = useHouseholdSettings(session, client, () => {
				reloadSession();
				setSession(freshSession);
			});
			if (state.status !== "ready") return <TextNode>{state.status}</TextNode>;
			return (
				<>
					<PressableText
						label="Rename action"
						onPress={() => void actions.renameHousehold("Lake House")}
					/>
					<TextNode>{`resourceKey:${session.resourceKey}`}</TextNode>
					<TextNode>{`renamedHouseholdName:${state.renamedHouseholdName ?? "none"}`}</TextNode>
					{state.notice ? <TextNode>{state.notice}</TextNode> : null}
				</>
			);
		}

		await render(<Harness />);
		await screen.findByText("resourceKey:authenticated-app-session:1");

		await fireEvent.press(screen.getByText("Rename action"));

		await screen.findByText("resourceKey:authenticated-app-session:2");
		expect(screen.getByText("Household renamed.")).toBeTruthy();
		expect(screen.getByText("renamedHouseholdName:none")).toBeTruthy();
		expect(client.renameHousehold).toHaveBeenCalledWith({
			householdId: "hh_1",
			name: "Lake House",
		});
		expect(reloadSession).toHaveBeenCalledTimes(1);
	});

	it("does not preserve non-rename notices after the session metadata reload refreshes settings", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			setMemberRole: jest.fn(async () => undefined),
			listMembers: jest.fn(async () => [
				{
					membershipId: "mbr_2",
					userId: "usr_2",
					role: "owner" as const,
					displayName: "Blake",
				},
			]),
		});

		function Harness() {
			const [session, setSession] = useState(sessionFixture());
			const freshSession = {
				...sessionFixture(),
				resourceKey: "authenticated-app-session:2",
			};
			const { state, actions } = useHouseholdSettings(session, client, () => {
				reloadSession();
				setSession(freshSession);
			});
			if (state.status !== "ready") return <TextNode>{state.status}</TextNode>;
			return (
				<>
					<PressableText
						label="Change role"
						onPress={() => void actions.setMemberRole("mbr_2", "owner")}
					/>
					<TextNode>{`resourceKey:${session.resourceKey}`}</TextNode>
					{state.notice ? <TextNode>{state.notice}</TextNode> : null}
				</>
			);
		}

		await render(<Harness />);
		await screen.findByText("resourceKey:authenticated-app-session:1");

		await fireEvent.press(screen.getByText("Change role"));

		await screen.findByText("resourceKey:authenticated-app-session:2");
		expect(screen.queryByText("Member role changed.")).toBeNull();
		expect(reloadSession).toHaveBeenCalledTimes(1);
	});

	it("retires and reloads the session after leaving without routing Home", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			leaveHousehold: jest.fn(async () => ({
				left: true as const,
				promotedMembershipId: "mbr_2",
			})),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="leave"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Leave"));

		await waitFor(() =>
			expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" }),
		);
		expect(mockReplace).not.toHaveBeenCalledWith("/");
	});

	it("keeps the current Household when sync-before-leave fails", async () => {
		const session = sessionFixture();
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			leaveHousehold: jest.fn(async () => ({
				left: true as const,
				promotedMembershipId: null,
			})),
		});
		session.services.sync.requestSync = jest.fn(async () => {
			throw new Error("sync failed");
		});

		function Harness() {
			const { state, actions } = useHouseholdSettings(
				session,
				client,
				reloadSession,
			);
			if (state.status !== "ready") return <TextNode>{state.status}</TextNode>;
			return (
				<>
					<PressableText
						label="Leave"
						onPress={() => {
							void actions.leaveHousehold();
						}}
					/>
					<TextNode>{state.operation.status}</TextNode>
					{state.notice ? <TextNode>{state.notice}</TextNode> : null}
				</>
			);
		}

		await render(<Harness />);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Leave"));

		await screen.findByText(
			"Unable to sync this Household before leaving. Try again.",
		);
		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(reloadSession).not.toHaveBeenCalled();
		expect(session.services.sync.requestSync).toHaveBeenCalledWith({
			reason: "manualRefresh",
		});
	});

	it("surfaces leave failures without retiring or routing", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			leaveHousehold: jest.fn(async () => {
				throw new Error("The only Member cannot leave the Household.");
			}),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="leave"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Leave"));

		await screen.findByText("The only Member cannot leave the Household.");
		expect(reloadSession).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalledWith("/");
	});

	it("retires and reloads the session after deleting a Household", async () => {
		const reloadSession = jest.fn();
		const members = [
			{
				membershipId: "mbr_1",
				userId: "usr_1",
				role: "owner" as const,
				displayName: "Avery",
			},
			{
				membershipId: "mbr_2",
				userId: "usr_2",
				role: "member" as const,
				displayName: "Blake",
			},
		];
		const client = readySettingsClient({
			deleteHousehold: jest.fn(async () => undefined),
			listMembers: jest.fn(async () => members),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="delete"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Delete action"));

		await waitFor(() =>
			expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" }),
		);
		expect(client.deleteHousehold).toHaveBeenCalledWith("hh_1");
		expect(track).toHaveBeenCalledWith("household_deleted", {
			household_id: "hh_1",
			deleted_by_user_id: "usr_1",
			member_count: 2,
		});
	});

	it("surfaces Household delete failures without retiring", async () => {
		const reloadSession = jest.fn();
		const client = readySettingsClient({
			deleteHousehold: jest.fn(async () => {
				throw new Error("Only Owners can delete a Household.");
			}),
		});

		await render(
			<SettingsActionHarness
				client={client}
				action="delete"
				reloadSession={reloadSession}
			/>,
		);
		await screen.findByText("idle");

		await fireEvent.press(screen.getByText("Delete action"));

		await screen.findByText("Only Owners can delete a Household.");
		expect(reloadSession).not.toHaveBeenCalled();
	});
});

describe("HouseholdSwitch", () => {
	it("renders loading state while the Authenticated App Session is preparing", async () => {
		mockAuthenticatedAppSession = {
			...mockAuthenticatedAppSession,
			state: { status: "loading" },
			session: null,
		};

		await render(<HouseholdSwitchScreen />);

		expect(screen.getByText("Preparing your Household")).toBeTruthy();
	});

	it("renders retryable error state when the Authenticated App Session fails", async () => {
		mockAuthenticatedAppSession = {
			...mockAuthenticatedAppSession,
			state: {
				status: "error",
				message: "Unable to prepare your Household.",
			},
			session: null,
		};

		await render(<HouseholdSwitchScreen />);

		expect(screen.getByText("Household unavailable")).toBeTruthy();
		expect(screen.getByText("Unable to prepare your Household.")).toBeTruthy();
		await fireEvent.press(screen.getByText("Try again"));
		expect(mockRetrySession).toHaveBeenCalledTimes(1);
	});

	it("renders the active Household badge", async () => {
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
				onSwitchHousehold={jest.fn()}
			/>,
		);

		expect(screen.getByText("Current")).toBeTruthy();
		expect(screen.getByText("Lake House")).toBeTruthy();
	});

	it("creates a Household, tracks success, and reloads the Authenticated App Session", async () => {
		const session = sessionFixture();
		const createHousehold = jest.fn(async () => ({
			id: "hh_created",
			name: "Work Pantry",
		}));

		function Harness() {
			const model = useHouseholdSwitch(session, mockReloadSession, {
				...emptyClient(),
				createHousehold,
			});
			return (
				<>
					<PressableText
						label="Set name"
						onPress={() => model.setHouseholdName("Work Pantry")}
					/>
					<PressableText
						label="Create"
						onPress={() => void model.createHousehold()}
					/>
					<TextNode>{model.state.operation.status}</TextNode>
				</>
			);
		}

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Set name"));
		await fireEvent.press(screen.getByText("Create"));

		await waitFor(() =>
			expect(mockReloadSession).toHaveBeenCalledWith({
				mode: "retireCurrent",
			}),
		);
		expect(createHousehold).toHaveBeenCalledWith({ name: "Work Pantry" });
		expect(mockReplace).toHaveBeenCalledWith("/");
		expect(track).toHaveBeenCalledWith("household_created", {
			household_id: "hh_created",
			created_by_user_id: "usr_1",
			source: "manual",
		});
	});

	it("creates a Household without a name when the name input is blank", async () => {
		const createHousehold = jest.fn(async () => ({
			id: "hh_created",
			name: "Blue Basket",
		}));

		function Harness() {
			const model = useHouseholdSwitch(sessionFixture(), mockReloadSession, {
				...emptyClient(),
				createHousehold,
			});
			return (
				<PressableText
					label="Create"
					onPress={() => void model.createHousehold()}
				/>
			);
		}

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Create"));

		await waitFor(() =>
			expect(mockReloadSession).toHaveBeenCalledWith({
				mode: "retireCurrent",
			}),
		);
		expect(createHousehold).toHaveBeenCalledWith({ name: undefined });
	});

	it("keeps the current Household when sync-before-create fails", async () => {
		const session = sessionFixture();
		const createHousehold = jest.fn(async () => ({
			id: "hh_created",
			name: "Work Pantry",
		}));
		session.services.sync.requestSync = jest.fn(async () => {
			throw new Error("sync failed");
		});

		function Harness() {
			const model = useHouseholdSwitch(session, mockReloadSession, {
				...emptyClient(),
				createHousehold,
			});
			return (
				<>
					<PressableText
						label="Create"
						onPress={() => void model.createHousehold()}
					/>
					{model.state.notice ? (
						<TextNode>{model.state.notice}</TextNode>
					) : null}
				</>
			);
		}

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Create"));

		await screen.findByText(
			"Unable to sync this Household before creating a new Household. Try again.",
		);
		expect(createHousehold).not.toHaveBeenCalled();
		expect(mockReloadSession).not.toHaveBeenCalled();
		expect(session.services.sync.requestSync).toHaveBeenCalledWith({
			reason: "manualRefresh",
		});
	});

	it("shows Household switch notices at the screen form level", async () => {
		const notice =
			"Unable to sync this Household before creating a new Household. Try again.";

		await render(
			<HouseholdSwitchView
				session={sessionFixture()}
				state={{
					code: "",
					householdName: "",
					notice,
					operation: { status: "idle" },
				}}
				onCodeChange={jest.fn()}
				onHouseholdNameChange={jest.fn()}
				onCreateHousehold={jest.fn()}
				onJoinByCode={jest.fn()}
				onSwitchHousehold={jest.fn()}
			/>,
		);

		expect(screen.getByText(notice).parent).not.toBe(
			screen.getByText("Join Household with Code").parent,
		);
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

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Switch"));

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

	it("keeps the current Household when sync-before-switch cannot start", async () => {
		const session = sessionFixture();
		const switchHousehold = jest.fn(async () => undefined);
		session.services.sync.requestSync = jest.fn(async () => null);

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

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Switch"));

		await waitFor(() =>
			expect(
				screen.getByText(
					"Unable to sync this Household before switching. Try again.",
				),
			).toBeTruthy(),
		);
		expect(switchHousehold).not.toHaveBeenCalled();
	});

	it("keeps the current Household when sync-before-join fails", async () => {
		const session = sessionFixture();
		const joinByCode = jest.fn(async () => undefined);
		session.services.sync.requestSync = jest.fn(async () => null);

		function Harness() {
			const model = useHouseholdSwitch(session, mockReloadSession, {
				...emptyClient(),
				joinByCode,
			});
			return (
				<>
					<PressableText
						label="Set code"
						onPress={() => model.setCode("ABCDEFGH")}
					/>
					<PressableText label="Join" onPress={() => void model.joinByCode()} />
					{model.state.notice ? (
						<TextNode>{model.state.notice}</TextNode>
					) : null}
				</>
			);
		}

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Set code"));
		await fireEvent.press(screen.getByText("Join"));

		await screen.findByText(
			"Unable to sync this Household before joining. Try again.",
		);
		expect(joinByCode).not.toHaveBeenCalled();
		expect(mockReloadSession).not.toHaveBeenCalled();
		expect(session.services.sync.requestSync).toHaveBeenCalledWith({
			reason: "manualRefresh",
		});
	});

	it("does not join by code while a Household switch is running", async () => {
		const session = sessionFixture();
		const sync =
			deferred<Awaited<ReturnType<typeof session.services.sync.requestSync>>>();
		const joinByCode = jest.fn(async () => undefined);
		session.services.sync.requestSync = jest.fn(() => sync.promise);

		function Harness() {
			const model = useHouseholdSwitch(session, jest.fn(), {
				...emptyClient(),
				joinByCode,
			});
			return (
				<>
					<PressableText
						label="Set code"
						onPress={() => model.setCode("ABCDEFGH")}
					/>
					<PressableText
						label="Switch"
						onPress={() => void model.switchHousehold("hh_2")}
					/>
					<PressableText label="Join" onPress={() => void model.joinByCode()} />
					<TextNode>{model.state.operation.status}</TextNode>
				</>
			);
		}

		await render(<Harness />);
		await fireEvent.press(screen.getByText("Set code"));
		await fireEvent.press(screen.getByText("Switch"));
		await screen.findByText("switchingHousehold");

		await fireEvent.press(screen.getByText("Join"));

		expect(joinByCode).not.toHaveBeenCalled();
	});
});

describe("PublicHouseholdEntry", () => {
	it("does not render invitee email, Member list, visible token, or code", async () => {
		await render(
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

	it("does not restart the Invitation preview when the auth token getter changes identity", async () => {
		const fetcher = jest
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input) => {
				const url = String(input);
				if (!url.endsWith("/api/invitations/preview?token=secret-token")) {
					throw new Error(`Unexpected request: ${url}`);
				}

				return jsonResponse({
					available: true,
					householdName: "River House",
					inviterDisplayName: "Avery",
				});
			});

		function Harness() {
			const entry = usePublicHouseholdEntry({
				kind: "invitation",
				secret: "secret-token",
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Accept Invitation"
					onSubmit={entry.submit}
				/>
			);
		}

		await render(<Harness />);

		await screen.findByText("River House");
		expect(fetcher).toHaveBeenCalledTimes(1);
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
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Accept Invitation"
					onSubmit={entry.submit}
				/>
			);
		}

		await render(<Harness />);
		await act(async () => {
			resolvePreview({
				available: true,
				householdName: "River House",
				inviterDisplayName: "Avery",
			});
		});
		await screen.findByText("River House");
		await fireEvent.press(screen.getByText("Accept Invitation"));

		await waitFor(() =>
			expect(acceptInvitation).toHaveBeenCalledWith("secret-token"),
		);
		await waitFor(() => expect(mockReloadSession).toHaveBeenCalledTimes(1));
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("routes signed-out Users to sign-in with Invitation intent", async () => {
		mockIsSignedIn = false;
		const acceptInvitation = jest.fn(async () => undefined);
		const previewInvitation = jest.fn(async () => ({
			available: true as const,
			householdName: "River House",
			inviterDisplayName: "Avery",
		}));

		function Harness() {
			const entry = usePublicHouseholdEntry({
				kind: "invitation",
				secret: "secret-token",
				client: {
					...emptyClient(),
					previewInvitation,
					acceptInvitation,
				},
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Accept Invitation"
					onSubmit={entry.submit}
				/>
			);
		}

		await render(<Harness />);
		await screen.findByText("River House");

		await fireEvent.press(screen.getByText("Accept Invitation"));

		expect(acceptInvitation).not.toHaveBeenCalled();
		expect(mockReloadSession).not.toHaveBeenCalled();
		expect(mockPush).toHaveBeenCalledWith(
			"/sign-in?next=%2Finvitations%2Faccept&token=secret-token",
		);
	});

	it("routes signed-out Users to sign-in with Household Join Code intent without previewing", async () => {
		mockIsSignedIn = false;
		const joinByCode = jest.fn(async () => undefined);
		const previewJoinCode = jest.fn(async () => ({
			available: true as const,
			householdName: "River House",
		}));

		function Harness() {
			const entry = usePublicHouseholdEntry({
				kind: "joinCode",
				secret: "ABCDEFGH",
				client: {
					...emptyClient(),
					previewJoinCode,
					joinByCode,
				},
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Join Household"
					onSubmit={entry.submit}
				/>
			);
		}

		await render(<Harness />);
		await screen.findByText("Household");

		await fireEvent.press(screen.getByText("Join Household"));

		expect(previewJoinCode).not.toHaveBeenCalled();
		expect(joinByCode).not.toHaveBeenCalled();
		expect(mockReloadSession).not.toHaveBeenCalled();
		expect(mockPush).toHaveBeenCalledWith(
			"/sign-in?next=%2Fhouseholds%2Fjoin&code=ABCDEFGH",
		);
	});

	it("keeps Household Join Code links loading while auth state is unresolved", async () => {
		mockIsSignedIn = undefined;
		const joinByCode = jest.fn(async () => undefined);
		const previewJoinCode = jest.fn(async () => ({
			available: true as const,
			householdName: "River House",
		}));

		function Harness() {
			const entry = usePublicHouseholdEntry({
				kind: "joinCode",
				secret: "ABCDEFGH",
				client: {
					...emptyClient(),
					previewJoinCode,
					joinByCode,
				},
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Join Household"
					onSubmit={entry.submit}
				/>
			);
		}

		await render(<Harness />);

		expect(screen.getByText("Loading Household")).toBeTruthy();
		await waitFor(() => expect(previewJoinCode).not.toHaveBeenCalled());
		expect(screen.queryByText("Join Household")).toBeNull();
		expect(joinByCode).not.toHaveBeenCalled();
		expect(mockPush).not.toHaveBeenCalled();
	});

	it("uses join-link analytics source when joining from a public Household Join Code route", async () => {
		const joinByCode = jest.fn(async () => undefined);
		let resolvePreview: (
			preview: Awaited<ReturnType<HouseholdApiClient["previewJoinCode"]>>,
		) => void = () => undefined;
		const previewJoinCode = jest.fn(
			() =>
				new Promise<Awaited<ReturnType<HouseholdApiClient["previewJoinCode"]>>>(
					(resolve) => {
						resolvePreview = resolve;
					},
				),
		);

		function Harness() {
			const entry = usePublicHouseholdEntry({
				kind: "joinCode",
				secret: "ABCDEFGH",
				client: {
					...emptyClient(),
					previewJoinCode,
					joinByCode,
				},
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Join Household"
					onSubmit={entry.submit}
				/>
			);
		}

		await render(<Harness />);
		await act(async () => {
			resolvePreview({
				available: true,
				householdName: "River House",
			});
		});
		await screen.findByText("River House");

		await fireEvent.press(screen.getByText("Join Household"));

		await waitFor(() =>
			expect(joinByCode).toHaveBeenCalledWith(
				"ABCDEFGH",
				JOIN_LINK_HOUSEHOLD_JOIN_CODE_SOURCE,
			),
		);
		expect(mockReloadSession).toHaveBeenCalledTimes(1);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("returns to loading when the Invitation token changes", async () => {
		const nextPreview =
			deferred<Awaited<ReturnType<HouseholdApiClient["previewInvitation"]>>>();
		const previewInvitation = jest
			.fn()
			.mockResolvedValueOnce({
				available: true,
				householdName: "River House",
				inviterDisplayName: "Avery",
			})
			.mockReturnValueOnce(nextPreview.promise);
		const client = {
			...emptyClient(),
			previewInvitation,
		};

		function Harness({ secret }: { secret: string }) {
			const entry = usePublicHouseholdEntry({
				kind: "invitation",
				secret,
				client,
				reloadSession: mockReloadSession,
			});
			return (
				<PublicHouseholdEntryView
					state={entry.state}
					primaryLabel="Accept Invitation"
					onSubmit={entry.submit}
				/>
			);
		}

		const { rerender } = await render(<Harness secret="first-token" />);
		await screen.findByText("River House");

		await rerender(<Harness secret="second-token" />);

		expect(screen.getByText("Loading Household")).toBeTruthy();
		expect(screen.queryByText("River House")).toBeNull();

		await act(async () => {
			nextPreview.resolve({
				available: true,
				householdName: "Lake House",
				inviterDisplayName: "Blake",
			});
		});
		await screen.findByText("Lake House");
	});
});

function sessionFixture(): AuthenticatedAppSession {
	const lists: AuthenticatedAppSession["services"]["lists"] = {
		createList: jest.fn(),
		getList: jest.fn(),
		renameList: jest.fn(),
		deleteList: jest.fn(),
		listLists: jest.fn(),
	};
	const items: AuthenticatedAppSession["services"]["items"] = {
		listItems: jest.fn(),
		addItem: jest.fn(),
		setItemChecked: jest.fn(),
	};
	return {
		user: {
			id: "usr_1",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: null,
			onboardingCompletedAt: null,
		},
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
			changes: {
				subscribe: () => ({ remove() {} }),
			},
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
		renameHousehold: jest.fn(async () => true),
		createInvitation: jest.fn(),
		revokeInvitation: jest.fn(),
		removeMember: jest.fn(),
		setMemberRole: jest.fn(),
		leaveHousehold: jest.fn(),
		deleteHousehold: jest.fn(),
		regenerateJoinCode: jest.fn(),
		setJoinCodeEnabled: jest.fn(),
		copyText: jest.fn(),
		clearNotice: jest.fn(),
	};
}

function readySettingsState(members: HouseholdMember[]) {
	return {
		status: "ready" as const,
		members,
		invitations: [],
		joinCode: {
			enabled: false as const,
			householdId: "hh_1",
		},
		renamedHouseholdName: null,
		notice: null,
		operation: { status: "idle" as const },
	};
}

function readySettingsClient(
	overrides: Partial<HouseholdApiClient> = {},
): HouseholdApiClient {
	return {
		...emptyClient(),
		listMembers: jest.fn(async () => []),
		listInvitations: jest.fn(async () => []),
		getJoinCode: jest.fn(async () => ({
			enabled: false as const,
			householdId: "hh_1",
		})),
		...overrides,
	};
}

function SettingsActionHarness({
	client,
	action,
	reloadSession = jest.fn(),
}: {
	client: HouseholdApiClient;
	action: "remove" | "role" | "leave" | "rename" | "delete";
	reloadSession?: (options?: AuthenticatedAppSessionReloadOptions) => void;
}) {
	const { state, actions } = useHouseholdSettings(
		sessionFixture(),
		client,
		reloadSession,
	);
	if (state.status !== "ready") return <TextNode>{state.status}</TextNode>;
	return (
		<>
			<PressableText
				label="Rename action"
				onPress={() => {
					if (action === "rename") void actions.renameHousehold("Lake House");
				}}
			/>
			<PressableText
				label="Remove"
				onPress={() => {
					if (action === "remove") void actions.removeMember("mbr_2");
				}}
			/>
			<PressableText
				label="Change role"
				onPress={() => {
					if (action === "role") void actions.setMemberRole("mbr_2", "owner");
				}}
			/>
			<PressableText
				label="Leave"
				onPress={() => {
					if (action === "leave") void actions.leaveHousehold();
				}}
			/>
			<PressableText
				label="Delete action"
				onPress={() => {
					if (action === "delete") void actions.deleteHousehold();
				}}
			/>
			<TextNode>{state.operation.status}</TextNode>
			<TextNode>{`renamedHouseholdName:${state.renamedHouseholdName ?? "none"}`}</TextNode>
			<TextNode>{`members:${state.members.length}`}</TextNode>
			<TextNode>{`firstRole:${state.members[0]?.role ?? "none"}`}</TextNode>
			{state.notice ? <TextNode>{state.notice}</TextNode> : null}
		</>
	);
}

function emptyClient(): HouseholdApiClient {
	return {
		createHousehold: jest.fn(),
		renameHousehold: jest.fn(),
		deleteHousehold: jest.fn(),
		listMembers: jest.fn(),
		removeMember: jest.fn(),
		setMemberRole: jest.fn(),
		leaveHousehold: jest.fn(),
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

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

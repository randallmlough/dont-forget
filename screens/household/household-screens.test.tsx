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
import { useHouseholdSettings } from "./use-household-settings";
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
					operation: { status: "idle" },
				}}
				actions={actions}
			/>,
		);

		expect(screen.getByText("Avery Chen")).toBeTruthy();
		expect(screen.getByText("pending@example.com")).toBeTruthy();
		expect(screen.getByText("ABCD EFGH")).toBeTruthy();
		fireEvent.press(screen.getByText("Copy link"));
		expect(actions.copyText).toHaveBeenCalledWith(
			"https://app.example/households/join?code=ABCDEFGH",
			"Household join link copied.",
		);
	});
});

describe("useHouseholdSettings", () => {
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
		const { rerender } = render(<Harness session={cachedSession} />);
		expect(screen.getByText("loading")).toBeTruthy();

		rerender(
			<Harness
				session={{
					...cachedSession,
					resourceKey: "authenticated-app-session:2",
				}}
			/>,
		);

		await waitFor(() => expect(screen.getByText("Fresh Member")).toBeTruthy());
	});
});

describe("HouseholdSwitch", () => {
	it("renders the active Household badge", () => {
		render(
			<HouseholdSwitchView
				session={sessionFixture()}
				state={{ code: "", notice: null, operation: { status: "idle" } }}
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

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

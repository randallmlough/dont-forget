import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { AuthenticatedAppSessionContextValue } from "@/components/session";
import type { HouseholdApiClient } from "@/lib/client-api/households";
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

beforeEach(() => {
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

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import type { AuthenticatedAppSession } from "@/client/session";
import { HouseholdSettingsView } from "./household-settings-screen";
import { HouseholdSwitchView } from "./household-switch-screen";
import type { HouseholdSettingsActions } from "./use-household-settings";

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/client/session/powersync", () => ({
	PowerSyncConnector: jest.fn(),
	powerSyncAppDatabase: {},
	readPowerSyncUrl: jest.fn(() => "https://sync.test"),
}));

describe("HouseholdSwitchView", () => {
	it("switches Households without a manual sync barrier", async () => {
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
		await screen.findByText("River");
		await fireEvent.press(await screen.findByText("Switch"));

		expect(onSwitchHousehold).toHaveBeenCalledWith("hh_river");
	});
});

describe("HouseholdSettingsView", () => {
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

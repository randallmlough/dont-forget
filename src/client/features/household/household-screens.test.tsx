import { fireEvent, render, screen } from "@testing-library/react-native";
import type { AuthenticatedAppSession } from "@/client/session";
import { HouseholdSwitchView } from "./household-switch-screen";

jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: jest.fn() }),
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
		);

		await screen.findByText("River");
		await fireEvent.press(await screen.findByText("Switch"));

		expect(onSwitchHousehold).toHaveBeenCalledWith("hh_river");
	});
});

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

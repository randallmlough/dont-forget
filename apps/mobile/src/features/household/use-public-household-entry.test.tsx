import type { HouseholdApiClient } from "@mobile/features/household/api";
import { setMockAuthState } from "@mobile/test/mocks/clerk";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { usePublicHouseholdEntry } from "./use-public-household-entry";

const mockDismissTo = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
	useRouter: () => ({
		dismissTo: mockDismissTo,
		push: mockPush,
		replace: mockReplace,
	}),
}));

beforeEach(() => {
	setMockAuthState({ isLoaded: true, isSignedIn: true });
	mockDismissTo.mockReset();
	mockPush.mockReset();
	mockReplace.mockReset();
});

describe("usePublicHouseholdEntry", () => {
	it("dismisses a warm Invitation deep link to the anchored Home after acceptance", async () => {
		const client = householdClientFixture();
		const reloadSession = jest.fn();
		const { result } = await renderHook(() =>
			usePublicHouseholdEntry({
				kind: "invitation",
				secret: "pending-token",
				reloadSession,
				client,
			}),
		);
		await waitFor(() => expect(result.current.state.status).toBe("ready"));

		await act(async () => {
			await result.current.submit();
		});

		expect(client.acceptInvitation).toHaveBeenCalledWith("pending-token");
		expect(reloadSession).toHaveBeenCalledTimes(1);
		expect(mockDismissTo).toHaveBeenCalledWith("/");
		expect(mockReplace).not.toHaveBeenCalled();
	});
});

type TestHouseholdClient = Pick<
	HouseholdApiClient,
	"joinByCode" | "previewJoinCode"
> & {
	acceptInvitation: jest.MockedFunction<HouseholdApiClient["acceptInvitation"]>;
	previewInvitation: jest.MockedFunction<
		HouseholdApiClient["previewInvitation"]
	>;
};

function householdClientFixture(): TestHouseholdClient {
	const acceptInvitation: jest.MockedFunction<
		HouseholdApiClient["acceptInvitation"]
	> = jest.fn(async (_token: string) => undefined);
	const previewInvitation: jest.MockedFunction<
		HouseholdApiClient["previewInvitation"]
	> = jest.fn(async (_token: string) => ({
		available: true,
		householdName: "Blue Basket",
		inviterDisplayName: "QA Owner",
	}));

	return {
		previewInvitation,
		acceptInvitation,
		async previewJoinCode() {
			return { available: false };
		},
		async joinByCode() {},
	};
}

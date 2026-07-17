import { renderHook } from "@testing-library/react-native";
import { setCurrentListSelection } from "@/client/features/list/current-selection";
import { track } from "@/client/lib/analytics";
import type { AuthenticatedAppSession } from "@/client/session";
import { deferred } from "@/test/async";
import { useSelectList } from "./use-select-list";

jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);

// This narrow persistence double controls rejection and unresolved writes at the
// exact boundary whose ordering and in-flight behavior the hook owns.
jest.mock("@/client/features/list/current-selection", () => ({
	setCurrentListSelection: jest.fn(),
}));

const mockSetCurrentListSelection = jest.mocked(setCurrentListSelection);
const mockTrack = jest.mocked(track);

afterEach(() => {
	jest.clearAllMocks();
});

describe("useSelectList", () => {
	it("persists the Current List before reporting a successful switch", async () => {
		const write = deferred<void>();
		mockSetCurrentListSelection.mockReturnValue(write.promise);
		const { result } = await renderHook(() => useSelectList(sessionFixture()));

		const selection = result.current("lst_pantry", "lst_groceries");

		expect(mockSetCurrentListSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_avery",
			"lst_pantry",
		);
		expect(mockTrack).not.toHaveBeenCalled();

		write.resolve(undefined);
		await expect(selection).resolves.toBe(true);
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_avery",
			list_id: "lst_pantry",
			user_id: "usr_avery",
		});
	});

	it("returns false after a persistence failure and allows a later switch", async () => {
		mockSetCurrentListSelection
			.mockRejectedValueOnce(new Error("write failed"))
			.mockResolvedValueOnce(undefined);
		const { result } = await renderHook(() => useSelectList(sessionFixture()));

		await expect(result.current("lst_pantry", "lst_groceries")).resolves.toBe(
			false,
		);
		expect(mockTrack).not.toHaveBeenCalled();

		await expect(result.current("lst_bakery", "lst_groceries")).resolves.toBe(
			true,
		);
		expect(mockSetCurrentListSelection).toHaveBeenNthCalledWith(
			2,
			"usr_avery",
			"hh_avery",
			"lst_bakery",
		);
		expect(mockTrack).toHaveBeenCalledTimes(1);
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_avery",
			list_id: "lst_bakery",
			user_id: "usr_avery",
		});
	});

	it("ignores selecting the Current List", async () => {
		const { result } = await renderHook(() => useSelectList(sessionFixture()));

		await expect(
			result.current("lst_groceries", "lst_groceries"),
		).resolves.toBe(false);
		expect(mockSetCurrentListSelection).not.toHaveBeenCalled();
		expect(mockTrack).not.toHaveBeenCalled();
	});

	it("ignores a second selection while persistence is unresolved", async () => {
		const write = deferred<void>();
		mockSetCurrentListSelection.mockReturnValue(write.promise);
		const { result } = await renderHook(() => useSelectList(sessionFixture()));

		const firstSelection = result.current("lst_pantry", "lst_groceries");
		await expect(result.current("lst_bakery", "lst_groceries")).resolves.toBe(
			false,
		);

		expect(mockSetCurrentListSelection).toHaveBeenCalledTimes(1);
		expect(mockTrack).not.toHaveBeenCalled();

		write.resolve(undefined);
		await expect(firstSelection).resolves.toBe(true);
		expect(mockTrack).toHaveBeenCalledTimes(1);
		expect(mockTrack).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_avery",
			list_id: "lst_pantry",
			user_id: "usr_avery",
		});
	});
});

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery's Home" },
		households: [
			{
				id: "hh_avery",
				name: "Avery's Home",
				role: "owner",
				isActive: true,
			},
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery",
			},
		],
	};
}

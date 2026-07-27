import {
	act,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Text } from "react-native";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { ListSummary } from "@/client/features/list/list-service";
import { logger } from "@/client/lib/logger";
import type { AuthenticatedAppSession } from "@/client/session";
import { useCurrentListSelection } from "./use-current-list-selection";
import type { ListRows } from "./use-list-rows";

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

jest.mock("@/client/features/list/current-selection", () => ({
	getCurrentListSelection: jest.fn(),
	clearCurrentListSelectionIfMatches: jest.fn(async () => false),
}));

const mockGetSelection = jest.mocked(getCurrentListSelection);
const mockClearSelection = jest.mocked(clearCurrentListSelectionIfMatches);
const mockLogger = jest.mocked(logger);

/** The active List rows Home hands the resolver, as of the current render. */
let listRows: ListRows;

beforeEach(() => {
	listRows = readyListRows([]);
	mockGetSelection.mockResolvedValue(null);
	mockClearSelection.mockResolvedValue(false);
});

afterEach(() => {
	jest.clearAllMocks();
});

describe("useCurrentListSelection", () => {
	it("renders loading while the stored Current List selection is pending", async () => {
		let resolveSelection: (value: string | null) => void = () => {};
		const pendingSelection = new Promise<string | null>((resolve) => {
			resolveSelection = resolve;
		});
		mockGetSelection.mockReturnValue(pendingSelection);
		const view = await renderCurrentListSelection({
			summaries: [summary("lst_recent")],
		});

		expect(screen.getByText("loading")).toBeTruthy();

		await act(async () => {
			resolveSelection(null);
		});
		view.unmount();
	});

	it("renders loading while active List summaries are loading", async () => {
		await renderCurrentListSelection({
			summaries: [],
			summariesIsLoading: true,
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));
		expect(screen.getByText("loading")).toBeTruthy();
	});

	it("resolves the stored selection when it is an active List", async () => {
		mockGetSelection.mockResolvedValue("lst_pantry");
		await renderCurrentListSelection({
			summaries: [
				summary("lst_groceries", "Groceries"),
				summary("lst_pantry", "Pantry"),
			],
		});

		expect(await screen.findByText("active:lst_pantry")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("falls back in memory to the most recently active List when nothing is stored", async () => {
		mockGetSelection.mockResolvedValue(null);
		await renderCurrentListSelection({
			// Summaries are queried sort: recentActivity, so index 0 is most recent.
			summaries: [
				summary("lst_recent", "Recent"),
				summary("lst_older", "Older"),
			],
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection after fresh List summaries emit and falls back without persisting the fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		const view = await renderCurrentListSelection({
			summaries: [],
			summariesIsLoading: true,
		});

		expect(await screen.findByText("loading")).toBeTruthy();
		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		listRows = readyListRows([summary("lst_recent", "Recent")]);
		view.rerender(<CurrentListSelectionHarness session={sessionFixture()} />);

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_gone",
			),
		);
	});

	it("clears an invalid stored selection when List summaries settled before the selection read", async () => {
		let resolveSelection: (value: string | null) => void = () => {};
		const pendingSelection = new Promise<string | null>((resolve) => {
			resolveSelection = resolve;
		});
		mockGetSelection.mockReturnValue(pendingSelection);
		await renderCurrentListSelection({
			summaries: [summary("lst_recent", "Recent")],
		});

		expect(screen.getByText("loading")).toBeTruthy();

		await act(async () => {
			resolveSelection("lst_gone");
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_gone",
			),
		);
	});

	it("renders zero-active when there are no active Lists", async () => {
		await renderCurrentListSelection({ summaries: [] });

		expect(await screen.findByText("zeroActive")).toBeTruthy();
	});

	it("maps a summaries query error to the List error state", async () => {
		await renderCurrentListSelection({
			summaries: [],
			summariesError: new Error("lists failed"),
		});

		expect(
			await screen.findByText(
				"error:Unable to load this List. Please try again.",
			),
		).toBeTruthy();
	});

	it("logs a clear failure and keeps rendering the active fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		mockClearSelection.mockRejectedValue(new Error("storage offline"));
		const view = await renderCurrentListSelection({
			summaries: [],
			summariesIsLoading: true,
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		listRows = readyListRows([summary("lst_recent")]);
		view.rerender(<CurrentListSelectionHarness session={sessionFixture()} />);

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"current List selection clear failed",
				{ error: expect.any(Error) },
			),
		);
	});

	it("logs a selection read failure and renders the most recently active List", async () => {
		mockGetSelection.mockRejectedValue(new Error("storage offline"));
		await renderCurrentListSelection({
			summaries: [summary("lst_recent")],
		});

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"current List selection read failed",
				{ error: expect.any(Error) },
			),
		);
	});

	it("reload re-reads the stored selection and renders the newly selected List", async () => {
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		const { result } = await renderUseCurrentListSelection({
			summaries: [
				summary("lst_recent", "Recent"),
				summary("lst_pantry", "Pantry"),
			],
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);

		await act(async () => {
			result.current.reload();
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_pantry",
			}),
		);
		expect(mockGetSelection).toHaveBeenCalledTimes(2);
	});

	it("keeps serving the resolved Current List while a refresh read is in flight", async () => {
		let resolveRefresh: (value: string | null) => void = () => {};
		mockGetSelection.mockResolvedValueOnce("lst_recent").mockReturnValueOnce(
			new Promise<string | null>((resolve) => {
				resolveRefresh = resolve;
			}),
		);
		const { result } = await renderUseCurrentListSelection({
			summaries: [
				summary("lst_recent", "Recent"),
				summary("lst_pantry", "Pantry"),
			],
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);

		await act(async () => {
			result.current.reload();
		});

		// Reporting loading here would unmount Home's List pager and flash a
		// full-screen spinner over a page switch that already landed.
		expect(result.current.state).toMatchObject({
			status: "active",
			listId: "lst_recent",
		});

		await act(async () => {
			resolveRefresh("lst_pantry");
		});

		expect(result.current.state).toMatchObject({
			status: "active",
			listId: "lst_pantry",
		});
	});

	it("clears a refreshed stored selection once that List stops being active", async () => {
		mockGetSelection
			.mockResolvedValueOnce("lst_recent")
			.mockResolvedValueOnce("lst_pantry");
		const { result, rerender } = await renderUseCurrentListSelection({
			summaries: [
				summary("lst_recent", "Recent"),
				summary("lst_pantry", "Pantry"),
			],
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);

		await act(async () => {
			result.current.reload();
		});
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_pantry",
			}),
		);

		// Another Member archives the switched-to List while Home stays mounted.
		await act(async () => {
			listRows = readyListRows([summary("lst_recent")]);
			rerender(undefined);
		});

		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_pantry",
			),
		);
		expect(result.current.state).toMatchObject({
			status: "active",
			listId: "lst_recent",
		});
	});

	it("does not clear a refreshed stored selection before List summaries emit after the refresh", async () => {
		mockGetSelection
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce("lst_pantry");
		const { result } = await renderUseCurrentListSelection({
			summaries: [summary("lst_recent", "Recent")],
		});

		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);
		mockClearSelection.mockClear();

		await act(async () => {
			result.current.reload();
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(result.current.state).toMatchObject({
				status: "active",
				listId: "lst_recent",
			}),
		);
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("does not clear an absent stored selection while summaries are fetching", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		const { rerender } = await renderUseCurrentListSelection({
			summaries: [],
			summariesIsLoading: true,
		});

		await waitFor(() => expect(mockGetSelection).toHaveBeenCalledTimes(1));

		await act(async () => {
			listRows = readyListRows([summary("lst_recent", "Recent")], true);
			rerender(undefined);
		});

		expect(mockClearSelection).not.toHaveBeenCalled();
	});
});

function CurrentListSelectionHarness({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const { state } = useCurrentListSelection(session, listRows);
	if (state.status === "active") {
		return <Text>{`active:${state.listId}`}</Text>;
	}
	if (state.status === "error") {
		return <Text>{`error:${state.message}`}</Text>;
	}
	return <Text>{state.status}</Text>;
}

async function renderCurrentListSelection(input: ListRowsFixture) {
	arrangeListRows(input);
	return render(<CurrentListSelectionHarness session={sessionFixture()} />);
}

async function renderUseCurrentListSelection(input: ListRowsFixture) {
	arrangeListRows(input);
	return renderHook(() => useCurrentListSelection(sessionFixture(), listRows));
}

type ListRowsFixture = {
	summaries: ListSummary[];
	summariesIsLoading?: boolean;
	summariesIsFetching?: boolean;
	summariesError?: Error;
};

function arrangeListRows(input: ListRowsFixture) {
	if (input.summariesError) {
		listRows = { status: "error" };
		return;
	}
	if (input.summariesIsLoading) {
		listRows = { status: "loading" };
		return;
	}
	listRows = readyListRows(input.summaries, input.summariesIsFetching);
}

function readyListRows(summaries: ListSummary[], isFetching = false): ListRows {
	return { status: "ready", summaries, isFetching };
}

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_1", name: "Home" },
		households: [],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery",
		},
		members: [
			{
				membershipId: "mbr_blake",
				userId: "usr_blake",
				role: "member",
				displayName: "Blake",
			},
		],
	};
}

function summary(id: string, name = id): ListSummary {
	return {
		id,
		householdId: "hh_1",
		name,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
		archived: false,
		archivedAt: null,
		lastActivityAt: 1,
		uncheckedItemCount: 0,
		checkedItemCount: 0,
	};
}

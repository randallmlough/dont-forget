import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import {
	clearCurrentListSelectionIfMatches,
	getCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { GetListResult, ListSummary } from "@/client/features/list/list-service";
import type { AuthenticatedAppSession } from "@/client/session";
import { useHomeCurrentList } from "./use-home-current-list";

// Restores the resolveCurrentList behavior coverage at the hook level (the old
// home-screen.test drove these through a real Household DB that the PowerSync
// cutover deleted). The resolver source is unchanged, so the candidate that
// wins must not change — these tests guard exactly that, against fake services.

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>(
			"@/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

jest.mock("@/client/features/list/current-selection", () => ({
	getCurrentListSelection: jest.fn(),
	clearCurrentListSelectionIfMatches: jest.fn(async () => false),
}));

const mockGetSelection = jest.mocked(getCurrentListSelection);
const mockClearSelection = jest.mocked(clearCurrentListSelectionIfMatches);

beforeEach(() => {
	mockGetSelection.mockResolvedValue(null);
	mockClearSelection.mockResolvedValue(false);
});

afterEach(() => {
	jest.clearAllMocks();
});

describe("useHomeCurrentList / resolveCurrentList", () => {
	it("resolves the stored selection when it is an active List", async () => {
		mockGetSelection.mockResolvedValue("lst_pantry");
		await renderHomeCurrentList(
			sessionFixture({
				summaries: [summary("lst_groceries"), summary("lst_pantry")],
				lists: {
					lst_groceries: available("lst_groceries", "Groceries"),
					lst_pantry: available("lst_pantry", "Pantry"),
				},
			}),
		);

		expect(await screen.findByText("active:lst_pantry")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("falls back in memory to the most recently active List when nothing is stored", async () => {
		mockGetSelection.mockResolvedValue(null);
		await renderHomeCurrentList(
			sessionFixture({
				// listLists is queried sort: recentActivity, so index 0 is most recent.
				summaries: [summary("lst_recent"), summary("lst_older")],
				lists: {
					lst_recent: available("lst_recent", "Recent"),
					lst_older: available("lst_older", "Older"),
				},
			}),
		);

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		expect(mockClearSelection).not.toHaveBeenCalled();
	});

	it("clears an invalid stored selection and falls back without persisting the fallback", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		await renderHomeCurrentList(
			sessionFixture({
				summaries: [summary("lst_recent")],
				lists: { lst_recent: available("lst_recent", "Recent") },
			}),
		);

		expect(await screen.findByText("active:lst_recent")).toBeTruthy();
		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_gone",
			),
		);
	});

	it("excludes a stored candidate archived between listLists() and getList() and renders the next List", async () => {
		mockGetSelection.mockResolvedValue("lst_stored");
		await renderHomeCurrentList(
			sessionFixture({
				summaries: [summary("lst_stored"), summary("lst_next")],
				lists: {
					// In the active snapshot but archived by the time getList runs.
					lst_stored: { status: "available", list: list("lst_stored", true) },
					lst_next: available("lst_next", "Next"),
				},
			}),
		);

		expect(await screen.findByText("active:lst_next")).toBeTruthy();
		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_stored",
			),
		);
	});

	it("excludes a stored candidate with a typed deleted getList() result and clears it", async () => {
		mockGetSelection.mockResolvedValue("lst_stored");
		await renderHomeCurrentList(
			sessionFixture({
				summaries: [summary("lst_stored"), summary("lst_next")],
				lists: {
					lst_stored: {
						status: "deleted",
						listId: "lst_stored",
						deletedAt: 1,
						updatedAt: 1,
					},
					lst_next: available("lst_next", "Next"),
				},
			}),
		);

		expect(await screen.findByText("active:lst_next")).toBeTruthy();
		await waitFor(() =>
			expect(mockClearSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_1",
				"lst_stored",
			),
		);
	});

	it("renders zero-active when there are no active Lists", async () => {
		await renderHomeCurrentList(sessionFixture({ summaries: [], lists: {} }));

		expect(await screen.findByText("zeroActive")).toBeTruthy();
	});

	it("renders zero-active after a bounded pass when every candidate is stale", async () => {
		await renderHomeCurrentList(
			sessionFixture({
				summaries: [summary("lst_a"), summary("lst_b")],
				lists: {
					lst_a: { status: "missing", listId: "lst_a" },
					lst_b: { status: "missing", listId: "lst_b" },
				},
			}),
		);

		expect(await screen.findByText("zeroActive")).toBeTruthy();
	});

	it("surfaces a retryable error when clearing an invalid stored selection throws", async () => {
		mockGetSelection.mockResolvedValue("lst_gone");
		mockClearSelection.mockRejectedValue(new Error("storage offline"));
		await renderHomeCurrentList(
			sessionFixture({
				summaries: [summary("lst_recent")],
				lists: { lst_recent: available("lst_recent", "Recent") },
			}),
		);

		expect(
			await screen.findByText(
				"error:Unable to load this List. Please try again.",
			),
		).toBeTruthy();
	});
});

function HomeCurrentListHarness({
	session,
}: {
	session: AuthenticatedAppSession;
}) {
	const { state } = useHomeCurrentList(session);
	if (state.status === "active") {
		return <Text>{`active:${state.listId}`}</Text>;
	}
	if (state.status === "error") {
		return <Text>{`error:${state.message}`}</Text>;
	}
	return <Text>{state.status}</Text>;
}

async function renderHomeCurrentList(session: AuthenticatedAppSession) {
	return render(<HomeCurrentListHarness session={session} />);
}

function sessionFixture(input: {
	summaries: ListSummary[];
	lists: Record<string, GetListResult>;
}): AuthenticatedAppSession {
	const unused = jest.fn(async () => {
		throw new Error("unexpected service call");
	});
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
		members: [],
		resourceKey: "authenticated-app-session:1",
		services: {
			lists: {
				listLists: jest.fn(async () => input.summaries),
				getList: jest.fn(
					async ({ listId }): Promise<GetListResult> =>
						input.lists[listId] ?? { status: "missing", listId },
				),
				createList: unused,
				renameList: unused,
				deleteList: unused,
			},
			items: {
				listItems: jest.fn(async () => []),
				addItem: unused,
				setItemChecked: unused,
			},
			changes: { subscribe: () => ({ remove() {} }) },
			sync: {
				getStatus: () => "synced",
				subscribe: () => ({ remove() {} }),
			},
		},
	};
}

function summary(id: string): ListSummary {
	return {
		id,
		householdId: "hh_1",
		name: id,
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

function list(id: string, archived: boolean) {
	return {
		id,
		householdId: "hh_1",
		name: id,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
		archived,
		archivedAt: archived ? 1 : null,
	};
}

function available(id: string, name: string): GetListResult {
	return {
		status: "available",
		list: { ...list(id, false), name },
	};
}

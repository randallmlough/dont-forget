import {
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import {
	clearCurrentListSelection,
	setCurrentListSelection,
} from "@/client/features/list/current-selection";
import type { List, ListSummary } from "@/client/features/list/list-service";
import { track } from "@/client/lib/analytics";
import type { AuthenticatedAppSession } from "@/client/session";
import { useAuthenticatedAppSession } from "@/client/session";
import ListsScreen from "./lists-screen";
import { useHomeCurrentList } from "./use-home-current-list";
import { useListRows } from "./use-list-rows";
import {
	type ProductServices,
	useProductServices,
} from "./use-product-services";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/client/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("./use-home-current-list", () => ({
	useHomeCurrentList: jest.fn(),
}));

jest.mock("./use-list-rows", () => ({ useListRows: jest.fn() }));
jest.mock("./use-product-services", () => ({ useProductServices: jest.fn() }));
jest.mock("@/client/features/list/current-selection", () => ({
	clearCurrentListSelection: jest.fn(),
	setCurrentListSelection: jest.fn(),
}));
jest.mock("@/client/lib/analytics", () =>
	jest.requireActual("@/test/mocks/analytics"),
);

const mockCreateList = jest.fn();
const mockRenameList = jest.fn();
const mockDeleteList = jest.fn();
const mockListLists = jest.fn();

beforeEach(() => {
	mockReplace.mockReset();
	mockCreateList.mockReset();
	mockRenameList.mockReset();
	mockDeleteList.mockReset();
	mockListLists.mockReset();
	jest.mocked(track).mockClear();
	jest.mocked(setCurrentListSelection).mockReset().mockResolvedValue();
	jest.mocked(clearCurrentListSelection).mockReset().mockResolvedValue();
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: sessionFixture(),
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
	jest.mocked(useListRows).mockReturnValue({
		rows: { status: "ready", summaries: summariesFixture() },
	});
	jest.mocked(useHomeCurrentList).mockReturnValue({
		state: {
			status: "active",
			listId: "lst_groceries",
			list: {
				householdName: "Juniper House",
				listName: "Groceries",
				items: [],
			},
			actions: {
				addItem: jest.fn(async () => undefined),
				setItemChecked: jest.fn(async () => undefined),
			},
		},
		retry: jest.fn(),
		reload: jest.fn(),
	});
	jest.mocked(useProductServices).mockReturnValue(productServicesFixture());
});

describe("ListsScreen", () => {
	it("renders the loading rows state", async () => {
		jest.mocked(useListRows).mockReturnValueOnce({
			rows: { status: "loading" },
		});
		await renderScreen();

		expect(screen.getByText("New List")).toBeTruthy();
	});

	it("renders the error rows state", async () => {
		jest.mocked(useListRows).mockReturnValue({ rows: { status: "error" } });
		await renderScreen();

		expect(screen.getByText("Unable to load your Lists.")).toBeTruthy();
	});

	it("renders List counts and the Current badge", async () => {
		await renderScreen();

		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("3 unchecked · 2 checked")).toBeTruthy();
		expect(screen.getByText("Current List")).toBeTruthy();
	});

	it("uses the current List without persisting or tracking a switch", async () => {
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "Groceries" }));

		expect(setCurrentListSelection).not.toHaveBeenCalled();
		expect(track).not.toHaveBeenCalledWith("list_switched", expect.anything());
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("navigates after a non-current List selection persists", async () => {
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "Pantry" }));

		await waitFor(() =>
			expect(setCurrentListSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_juniper",
				"lst_pantry",
			),
		);
		expect(track).toHaveBeenCalledWith("list_switched", {
			household_id: "hh_juniper",
			list_id: "lst_pantry",
			user_id: "usr_avery",
		});
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("stays on Lists when non-current selection persistence fails", async () => {
		jest
			.mocked(setCurrentListSelection)
			.mockRejectedValueOnce(new Error("storage unavailable"));
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "Pantry" }));

		await waitFor(() =>
			expect(setCurrentListSelection).toHaveBeenCalledTimes(1),
		);
		expect(track).not.toHaveBeenCalledWith("list_switched", expect.anything());
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("persists a created List selection before navigating Home", async () => {
		const created = listFixture("lst_created", "Hardware");
		mockCreateList.mockResolvedValue({
			status: "available",
			list: created,
			didWrite: true,
		});
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await fireEvent.changeText(screen.getByLabelText("List name"), "Hardware");
		await fireEvent.press(screen.getByRole("button", { name: "Create" }));

		await waitFor(() =>
			expect(setCurrentListSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_juniper",
				"lst_created",
			),
		);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("returns an empty Household to retryable rows when created List selection persistence fails", async () => {
		jest.mocked(useListRows).mockReturnValue({
			rows: { status: "ready", summaries: [] },
		});
		mockCreateList.mockResolvedValue({
			status: "available",
			list: listFixture("lst_created", "Hardware"),
			didWrite: true,
		});
		jest
			.mocked(setCurrentListSelection)
			.mockRejectedValueOnce(new Error("storage unavailable"));
		await renderScreen();

		await fireEvent.changeText(screen.getByLabelText("List name"), "Hardware");
		await fireEvent.press(screen.getByRole("button", { name: "Create" }));

		await waitFor(() =>
			expect(screen.queryByLabelText("List name")).toBeNull(),
		);
		const createButton = screen.getByRole("button", { name: "New List" });
		expect(mockReplace).not.toHaveBeenCalled();

		await fireEvent.press(createButton);

		expect(screen.getByLabelText("List name")).toBeTruthy();
	});

	it("shows the service validation message for an invalid create name", async () => {
		mockCreateList.mockResolvedValue({
			status: "invalidName",
			reason: "required",
			didWrite: false,
		});
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await fireEvent.press(screen.getByRole("button", { name: "Create" }));

		expect(await screen.findByText("List name is required.")).toBeTruthy();
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("renames a List from its native action menu", async () => {
		mockRenameList.mockResolvedValue({
			status: "available",
			list: listFixture("lst_pantry", "Weekly Pantry"),
			didWrite: true,
		});
		await renderScreen();

		await chooseListAction("Pantry", "Rename");
		const listNameInput = await screen.findByLabelText("List name");
		await fireEvent.changeText(listNameInput, "Weekly Pantry");
		await fireEvent.press(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(mockRenameList).toHaveBeenCalledWith({
				listId: "lst_pantry",
				name: "Weekly Pantry",
			}),
		);
		expect(
			screen.getByRole("button", { name: "List actions for Pantry" }),
		).toBeTruthy();
	});

	it("repairs selection after deleting the current List", async () => {
		mockDeleteList.mockResolvedValue({
			status: "deleted",
			listId: "lst_groceries",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: true,
		});
		mockListLists.mockResolvedValue([summariesFixture()[1]]);
		await renderScreen();

		await chooseListAction("Groceries", "Delete");
		await fireEvent.press(
			await screen.findByRole("button", { name: "Delete" }),
		);

		await waitFor(() =>
			expect(mockListLists).toHaveBeenCalledWith({
				archive: "active",
				sort: "recentActivity",
			}),
		);
		expect(setCurrentListSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_juniper",
			"lst_pantry",
		);
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(track).not.toHaveBeenCalledWith("list_switched", expect.anything());
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("clears selection after deleting the only current List", async () => {
		jest.mocked(useListRows).mockReturnValue({
			rows: { status: "ready", summaries: [summariesFixture()[0]] },
		});
		mockDeleteList.mockResolvedValue({
			status: "deleted",
			listId: "lst_groceries",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: true,
		});
		mockListLists.mockResolvedValue([]);
		await renderScreen();

		await chooseListAction("Groceries", "Delete");
		await fireEvent.press(
			await screen.findByRole("button", { name: "Delete" }),
		);

		await waitFor(() =>
			expect(clearCurrentListSelection).toHaveBeenCalledWith(
				"usr_avery",
				"hh_juniper",
			),
		);
		expect(setCurrentListSelection).not.toHaveBeenCalled();
		expect(track).not.toHaveBeenCalledWith("list_switched", expect.anything());
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("returns to rows when current List repair cannot read remaining Lists", async () => {
		mockDeleteList.mockResolvedValue({
			status: "deleted",
			listId: "lst_groceries",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: true,
		});
		mockListLists.mockRejectedValue(new Error("database unavailable"));
		await renderScreen();

		await chooseListAction("Groceries", "Delete");
		await fireEvent.press(
			await screen.findByRole("button", { name: "Delete" }),
		);

		expect(
			await screen.findByRole("button", {
				name: "List actions for Groceries",
			}),
		).toBeTruthy();
		expect(setCurrentListSelection).not.toHaveBeenCalled();
		expect(clearCurrentListSelection).not.toHaveBeenCalled();
		expect(track).not.toHaveBeenCalledWith("list_switched", expect.anything());
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("returns to rows when current List repair cannot persist its fallback", async () => {
		mockDeleteList.mockResolvedValue({
			status: "deleted",
			listId: "lst_groceries",
			deletedAt: 2,
			updatedAt: 2,
			didWrite: true,
		});
		mockListLists.mockResolvedValue([summariesFixture()[1]]);
		jest
			.mocked(setCurrentListSelection)
			.mockRejectedValueOnce(new Error("storage unavailable"));
		await renderScreen();

		await chooseListAction("Groceries", "Delete");
		await fireEvent.press(
			await screen.findByRole("button", { name: "Delete" }),
		);

		expect(
			await screen.findByRole("button", {
				name: "List actions for Groceries",
			}),
		).toBeTruthy();
		expect(setCurrentListSelection).toHaveBeenCalledWith(
			"usr_avery",
			"hh_juniper",
			"lst_pantry",
		);
		expect(clearCurrentListSelection).not.toHaveBeenCalled();
		expect(track).not.toHaveBeenCalledWith("list_switched", expect.anything());
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("renders the create form directly when there are no Lists", async () => {
		jest.mocked(useListRows).mockReturnValue({
			rows: { status: "ready", summaries: [] },
		});

		await renderScreen();

		expect(screen.getByLabelText("List name")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
	});
});

function renderScreen() {
	return render(<ListsScreen />, { wrapper: TestAppShellProvider });
}

async function chooseListAction(listName: string, actionLabel: string) {
	await fireEvent.press(
		screen.getByRole("button", { name: `List actions for ${listName}` }),
	);
	await fireEvent.press(
		await screen.findByRole("button", { name: actionLabel }),
	);
}

function TestAppShellProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, left: 0, right: 0, bottom: 34 },
			}}
		>
			<NavigationDrawerProvider open={jest.fn()}>
				{children}
			</NavigationDrawerProvider>
		</SafeAreaProvider>
	);
}

function productServicesFixture(): ProductServices {
	const unexpected = jest.fn(async () => {
		throw new Error("unexpected service call");
	});
	return {
		lists: {
			createList: mockCreateList,
			renameList: mockRenameList,
			deleteList: mockDeleteList,
			listLists: mockListLists,
			listListsQuery: jest.fn(() => ({
				compile: () => ({ sql: "SELECT lists", parameters: [] }),
				execute: async () => [],
			})),
		},
		items: {
			listItems: unexpected,
			listItemsQuery: jest.fn(() => ({
				compile: () => ({ sql: "SELECT items", parameters: [] }),
				execute: async () => [],
			})),
			addItem: unexpected,
			setItemChecked: unexpected,
		},
	};
}

function summariesFixture(): ListSummary[] {
	return [
		{
			...summaryFixture("lst_groceries", "Groceries"),
			uncheckedItemCount: 3,
			checkedItemCount: 2,
		},
		summaryFixture("lst_pantry", "Pantry"),
	];
}

function summaryFixture(id: string, name: string): ListSummary {
	return {
		id,
		householdId: "hh_juniper",
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

function listFixture(id: string, name: string): List {
	return {
		id,
		householdId: "hh_juniper",
		name,
		createdByUserId: "usr_avery",
		createdAt: 1,
		updatedAt: 1,
		archived: false,
		archivedAt: null,
	};
}

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_juniper", name: "Juniper House" },
		households: [
			{
				id: "hh_juniper",
				name: "Juniper House",
				role: "owner",
				isActive: true,
			},
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [],
	};
}

import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationDrawerProvider } from "@/client/app-shell/navigation-drawer-context";
import {
	groceriesListSummary,
	pantryListSummary,
} from "@/client/features/list/list-test-support";
import type {
	CreateListOutcome,
	DeleteListOutcome,
	ListCollection,
	ListCollectionState,
	RenameListOutcome,
	SelectListOutcome,
} from "@/client/features/list/use-list-collection";
import { useListCollection } from "@/client/features/list/use-list-collection";
import { useAuthenticatedAppSession } from "@/client/session";
import { Toaster } from "@/client/ui/toast";
import ListsScreen from "./lists-screen";

const mockReplace = jest.fn();
const mockSelectList = jest.fn(
	async (_input: { listId: string }): Promise<SelectListOutcome> => ({
		status: "selected",
	}),
);
const mockCreateList = jest.fn(
	async (_input: { name: string }): Promise<CreateListOutcome> => ({
		status: "createdAndSelected",
		listId: "lst_created",
	}),
);
const mockRenameList = jest.fn(
	async (_input: {
		listId: string;
		name: string;
	}): Promise<RenameListOutcome> => ({
		status: "renamed",
	}),
);
const mockDeleteList = jest.fn(
	async (_input: { listId: string }): Promise<DeleteListOutcome> => ({
		status: "deleted",
	}),
);
const mockAlert = jest.spyOn(Alert, "alert");
const mockPrompt = jest.spyOn(Alert, "prompt");

jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/client/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/client/features/list/use-list-collection", () => ({
	useListCollection: jest.fn(),
}));

beforeEach(() => {
	mockReplace.mockReset();
	mockAlert.mockReset();
	mockPrompt.mockReset();
	mockSelectList.mockReset();
	mockCreateList.mockReset();
	mockRenameList.mockReset();
	mockDeleteList.mockReset();
	mockSelectList.mockResolvedValue({ status: "selected" });
	mockCreateList.mockResolvedValue({
		status: "createdAndSelected",
		listId: "lst_created",
	});
	mockRenameList.mockResolvedValue({ status: "renamed" });
	mockDeleteList.mockResolvedValue({ status: "deleted" });
	jest.mocked(useAuthenticatedAppSession).mockReturnValue({
		state: { status: "ready", refreshing: false },
		session: sessionFixture(),
		retry: jest.fn(),
		reloadSession: jest.fn(),
		signOut: jest.fn(),
	});
	jest.mocked(useListCollection).mockReturnValue(
		collectionFixture({
			status: "active",
			summaries: [groceriesListSummary, pantryListSummary],
			currentListId: "lst_groceries",
		}),
	);
});

afterEach(() => {
	mockAlert.mockReset();
	mockPrompt.mockReset();
});

describe("ListsScreen", () => {
	it("renders loading rows and keeps New List available", async () => {
		jest
			.mocked(useListCollection)
			.mockReturnValue(collectionFixture({ status: "loading" }));
		await renderScreen();
		expect(screen.getByText("New List")).toBeTruthy();
	});

	it("reports a collection error as a toast", async () => {
		jest.mocked(useListCollection).mockReturnValue(
			collectionFixture({
				status: "error",
				message: "Unable to load your Lists. Please try again.",
			}),
		);
		await renderScreen();
		expect(await screen.findByText("Unable to load your Lists.")).toBeTruthy();
	});

	it("renders summaries and the Current List badge", async () => {
		await renderScreen();
		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Current List")).toBeTruthy();
		expect(screen.getAllByText("0 unchecked · 0 checked")).toHaveLength(2);
	});

	it("navigates for the Current List without selecting it", async () => {
		await renderScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Groceries" }));
		expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_groceries" });
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("navigates after a non-current selection", async () => {
		await renderScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Pantry" }));
		await waitFor(() =>
			expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_pantry" }),
		);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("stays on Lists after a selection failure", async () => {
		mockSelectList.mockResolvedValue({
			status: "notSelected",
			reason: "selectionFailed",
			currentListId: "lst_groceries",
		});
		await renderScreen();
		await fireEvent.press(screen.getByRole("button", { name: "Pantry" }));
		await waitFor(() => expect(mockSelectList).toHaveBeenCalledTimes(1));
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("maps create outcomes to navigation and the created-list alert", async () => {
		await renderScreen();
		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await submitPrompt("Create", "Hardware");
		expect(mockCreateList).toHaveBeenCalledWith({ name: "Hardware" });
		expect(mockReplace).toHaveBeenCalledWith("/");

		mockReplace.mockReset();
		mockCreateList.mockResolvedValue({
			status: "createdSelectionFailed",
			listId: "lst_created",
		});
		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await submitPrompt("Create", "Hardware");
		await waitFor(() =>
			expect(mockAlert).toHaveBeenCalledWith(
				"Unable to Open List",
				"The List was created, but it could not be opened. Select it from Lists to try again.",
				undefined,
				{ userInterfaceStyle: "light" },
			),
		);
	});

	it("maps rename and delete actions to semantic collection calls", async () => {
		await renderScreen();
		await chooseListAction("Pantry", "Rename");
		await submitPrompt("Save", "Weekly Pantry");
		await waitFor(() =>
			expect(mockRenameList).toHaveBeenCalledWith({
				listId: "lst_pantry",
				name: "Weekly Pantry",
			}),
		);

		await chooseListAction("Pantry", "Delete");
		await confirmDelete();
		await waitFor(() =>
			expect(mockDeleteList).toHaveBeenCalledWith({ listId: "lst_pantry" }),
		);
	});
});

async function renderScreen() {
	await render(<ListsScreen />, { wrapper: TestAppShellProvider });
}

async function chooseListAction(listName: string, actionLabel: string) {
	await fireEvent.press(
		screen.getByRole("button", { name: `List actions for ${listName}` }),
	);
	await fireEvent.press(
		await screen.findByRole("button", { name: actionLabel }),
	);
}

async function submitPrompt(actionLabel: string, value: string) {
	const buttons = mockPrompt.mock.calls.at(-1)?.[2];
	if (!Array.isArray(buttons)) throw new Error("Expected a List name prompt.");
	const button = buttons.find((candidate) => candidate.text === actionLabel);
	if (!button?.onPress)
		throw new Error(`Expected ${actionLabel} prompt action.`);
	await act(async () => {
		// The test double models the native prompt's text callback; RN's broad
		// AlertButton type also describes login prompts here.
		(button.onPress as ((input?: string) => void) | undefined)?.(value);
	});
}

async function confirmDelete() {
	const buttons = mockAlert.mock.calls.at(-1)?.[2];
	if (!Array.isArray(buttons)) throw new Error("Expected delete confirmation.");
	const button = buttons.find((candidate) => candidate.text === "Delete");
	if (!button?.onPress) throw new Error("Expected delete action.");
	await act(async () => button.onPress?.());
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
			<Toaster />
		</SafeAreaProvider>
	);
}

function collectionFixture(state: ListCollectionState): ListCollection {
	return {
		state,
		actions: {
			retry: jest.fn(),
			selectList: mockSelectList,
			createList: mockCreateList,
			renameList: mockRenameList,
			deleteList: mockDeleteList,
		},
	};
}

function sessionFixture() {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_juniper", name: "Juniper House" },
		households: [],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner" as const,
			displayName: "Avery Chen",
		},
		members: [],
	};
}

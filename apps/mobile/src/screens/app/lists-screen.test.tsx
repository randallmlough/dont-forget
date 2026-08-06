import { NavigationDrawerProvider } from "@mobile/app-shell/navigation-drawer-context";
import {
	groceriesListSummary,
	pantryListSummary,
} from "@mobile/features/list/list-test-support";
import type {
	CreateListOutcome,
	DeleteListOutcome,
	ListCollection,
	ListCollectionState,
	RenameListOutcome,
	SelectListOutcome,
} from "@mobile/features/list/use-list-collection";
import { useListCollection } from "@mobile/features/list/use-list-collection";
import type { AuthenticatedAppSession } from "@mobile/session";
import { useAuthenticatedAppSession } from "@mobile/session";
import { deferred } from "@mobile/test/async";
import { drainToasts } from "@mobile/test/toast";
import { Toaster } from "@mobile/ui/toast";
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

// The Authenticated App Session and the List collection both sit on the native
// session and PowerSync watched-query boundary, which has no deterministic local
// harness. The seam under test here is the screen's presentation, prompts, and
// outcome-to-copy mapping; List policy is proven in the collection's own suite.
// Justification per docs/code-standards/testing.md:9.
jest.mock("@mobile/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@mobile/features/list/use-list-collection", () => ({
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
	showCollection({
		status: "active",
		summaries: summariesFixture(),
		currentListId: "lst_groceries",
	});
});

afterEach(drainToasts);

describe("ListsScreen", () => {
	it("renders the loading collection state", async () => {
		showCollection({ status: "loading" });
		await renderScreen();

		expect(screen.getByText("New List")).toBeTruthy();
		expect(screen.queryByText("Groceries")).toBeNull();
	});

	it("reports a toast when the Lists cannot load", async () => {
		showCollection({
			status: "error",
			message: "Unable to load your Lists. Please try again.",
		});
		await renderScreen();

		expect(
			await screen.findByText("Unable to load your Lists. Please try again."),
		).toBeTruthy();
		expect(screen.getByText("New List")).toBeTruthy();
	});

	it("renders List counts and the Current badge", async () => {
		await renderScreen();

		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("3 unchecked · 2 checked")).toBeTruthy();
		expect(screen.getByText("Current List")).toBeTruthy();
	});

	it("renders summaries without a Current badge while the Current List resolves", async () => {
		showCollection({
			status: "resolvingCurrentList",
			summaries: summariesFixture(),
		});
		await renderScreen();

		expect(screen.getByText("Groceries")).toBeTruthy();
		expect(screen.getByText("Pantry")).toBeTruthy();
		expect(screen.queryByText("Current List")).toBeNull();
	});

	it("opens the Current List without a new selection", async () => {
		mockSelectList.mockResolvedValue({ status: "alreadyCurrent" });
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "Groceries" }));

		await waitFor(() =>
			expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_groceries" }),
		);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("navigates after a non-current List selection persists", async () => {
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "Pantry" }));

		await waitFor(() =>
			expect(mockSelectList).toHaveBeenCalledWith({ listId: "lst_pantry" }),
		);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("stays on Lists when a non-current selection is not persisted", async () => {
		mockSelectList.mockResolvedValue({
			status: "notSelected",
			reason: "selectionFailed",
			currentListId: "lst_groceries",
		});
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "Pantry" }));

		await waitFor(() => expect(mockSelectList).toHaveBeenCalledTimes(1));
		expect(mockAlert).not.toHaveBeenCalled();
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("creates a List from the native prompt and opens it", async () => {
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		expectListNamePrompt({
			title: "Create List",
			actionLabel: "Create",
			initialName: "",
		});
		await submitListPrompt("Create", "Hardware");

		await waitFor(() =>
			expect(mockCreateList).toHaveBeenCalledWith({ name: "Hardware" }),
		);
		expect(mockReplace).toHaveBeenCalledWith("/");
	});

	it("returns an empty Household to retryable Lists when the created List cannot be opened", async () => {
		showCollection({ status: "zeroActive" });
		mockCreateList.mockResolvedValue({
			status: "createdSelectionFailed",
			listId: "lst_created",
		});
		await renderScreen();

		expect(mockPrompt).not.toHaveBeenCalled();
		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await submitListPrompt("Create", "Hardware");

		await waitFor(() =>
			expect(mockAlert).toHaveBeenCalledWith(
				"Unable to Open List",
				"The List was created, but it could not be opened. Select it from Lists to try again.",
				undefined,
				{ userInterfaceStyle: "light" },
			),
		);
		const createButton = screen.getByRole("button", { name: "New List" });
		expect(mockReplace).not.toHaveBeenCalled();

		await fireEvent.press(createButton);

		expect(mockPrompt).toHaveBeenCalledTimes(2);
	});

	it("shows the validation message for an invalid create name", async () => {
		mockCreateList.mockResolvedValue({
			status: "invalidName",
			reason: "required",
		});
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await submitListPrompt("Create", "");

		await waitFor(() =>
			expect(mockAlert).toHaveBeenCalledWith(
				"Unable to Create List",
				"List name is required.",
				[
					expect.objectContaining({
						text: "OK",
						onPress: expect.any(Function),
					}),
				],
				{ userInterfaceStyle: "light" },
			),
		);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("restores the attempted name after create fails", async () => {
		mockCreateList.mockResolvedValue({ status: "failed" });
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		await submitListPrompt("Create", "Hardware run");

		await waitFor(() =>
			expect(mockAlert).toHaveBeenCalledWith(
				"Unable to Create List",
				"Something went wrong. Please try again.",
				[
					expect.objectContaining({
						text: "OK",
						onPress: expect.any(Function),
					}),
				],
				{ userInterfaceStyle: "light" },
			),
		);

		pressAlertAction("OK");

		expectListNamePrompt({
			title: "Create List",
			actionLabel: "Create",
			initialName: "Hardware run",
		});
	});

	it("serializes List mutations and exposes disabled controls", async () => {
		const pendingCreate = deferred<CreateListOutcome>();
		mockCreateList.mockReturnValue(pendingCreate.promise);
		await renderScreen();

		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		const createAction = listPromptAction("Create");
		await act(async () => createAction("Hardware"));
		await waitFor(() => expect(mockCreateList).toHaveBeenCalledTimes(1));

		expect(
			screen.getByRole("button", { name: "New List" }).props.accessibilityState,
		).toMatchObject({ disabled: true });
		expect(
			screen.getByRole("button", { name: "List actions for Groceries" }).props
				.accessibilityState,
		).toMatchObject({ disabled: true });
		expect(
			screen.getByRole("button", { name: "List actions for Pantry" }).props
				.accessibilityState,
		).toMatchObject({ disabled: true });

		await act(async () => createAction("Duplicate Hardware"));
		expect(mockCreateList).toHaveBeenCalledTimes(1);

		await act(async () =>
			pendingCreate.resolve({
				status: "createdAndSelected",
				listId: "lst_created",
			}),
		);

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "New List" }).props
					.accessibilityState,
			).toMatchObject({ disabled: false }),
		);
		expect(
			screen.getByRole("button", { name: "List actions for Groceries" }).props
				.accessibilityState,
		).toMatchObject({ disabled: false });
		expect(
			screen.getByRole("button", { name: "List actions for Pantry" }).props
				.accessibilityState,
		).toMatchObject({ disabled: false });
	});

	it("renames a List from its native action menu", async () => {
		await renderScreen();

		await chooseListAction("Pantry", "Rename");
		expectListNamePrompt({
			title: "Rename List",
			actionLabel: "Save",
			initialName: "Pantry",
		});
		await submitListPrompt("Save", "Weekly Pantry");

		await waitFor(() =>
			expect(mockRenameList).toHaveBeenCalledWith({
				listId: "lst_pantry",
				name: "Weekly Pantry",
			}),
		);
		expect(mockAlert).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "List actions for Pantry" }),
		).toBeTruthy();
	});

	it("restores the attempted name after rename finds a List gone", async () => {
		mockRenameList.mockResolvedValue({ status: "gone" });
		await renderScreen();

		await chooseListAction("Pantry", "Rename");
		await submitListPrompt("Save", "Weekly Pantry");

		await waitFor(() =>
			expect(mockAlert).toHaveBeenCalledWith(
				"Unable to Rename List",
				"This List is no longer available.",
				[
					expect.objectContaining({
						text: "OK",
						onPress: expect.any(Function),
					}),
				],
				{ userInterfaceStyle: "light" },
			),
		);

		pressAlertAction("OK");

		expectListNamePrompt({
			title: "Rename List",
			actionLabel: "Save",
			initialName: "Weekly Pantry",
		});
	});

	it("deletes the Current List from its native action menu and stays on Lists", async () => {
		await renderScreen();

		await chooseListAction("Groceries", "Delete");
		await confirmListDeletion("Groceries");

		await waitFor(() =>
			expect(mockDeleteList).toHaveBeenCalledWith({ listId: "lst_groceries" }),
		);
		expect(mockAlert).toHaveBeenCalledTimes(1);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("reports a List that is already gone when deletion cannot find it", async () => {
		mockDeleteList.mockResolvedValue({ status: "gone" });
		await renderScreen();

		await chooseListAction("Pantry", "Delete");
		await confirmListDeletion("Pantry");

		await waitFor(() =>
			expect(mockAlert).toHaveBeenLastCalledWith(
				"Unable to Delete List",
				"This List is no longer available.",
				undefined,
				{ userInterfaceStyle: "light" },
			),
		);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("reports a generic failure when deletion fails", async () => {
		mockDeleteList.mockResolvedValue({ status: "failed" });
		await renderScreen();

		await chooseListAction("Pantry", "Delete");
		await confirmListDeletion("Pantry");

		await waitFor(() =>
			expect(mockAlert).toHaveBeenLastCalledWith(
				"Unable to Delete List",
				"Something went wrong. Please try again.",
				undefined,
				{ userInterfaceStyle: "light" },
			),
		);
		expect(mockReplace).not.toHaveBeenCalled();
	});

	it("keeps empty Lists visible until New List is selected", async () => {
		showCollection({ status: "zeroActive" });

		await renderScreen();

		expect(screen.queryByText("Current List")).toBeNull();
		expect(mockPrompt).not.toHaveBeenCalled();
		await fireEvent.press(screen.getByRole("button", { name: "New List" }));
		expectListNamePrompt({
			title: "Create List",
			actionLabel: "Create",
			initialName: "",
		});
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

function expectListNamePrompt({
	title,
	actionLabel,
	initialName,
}: {
	title: string;
	actionLabel: string;
	initialName: string;
}) {
	expect(mockPrompt).toHaveBeenLastCalledWith(
		title,
		undefined,
		[
			{ text: "Cancel", style: "cancel" },
			expect.objectContaining({
				text: actionLabel,
				isPreferred: true,
				onPress: expect.any(Function),
			}),
		],
		"plain-text",
		initialName,
		"default",
		{ userInterfaceStyle: "light" },
	);
}

async function submitListPrompt(actionLabel: string, value: string) {
	await act(async () => listPromptAction(actionLabel)(value));
}

function listPromptAction(actionLabel: string): (value?: string) => void {
	const buttons = mockPrompt.mock.calls.at(-1)?.[2];
	if (!Array.isArray(buttons)) {
		throw new Error("Expected a native List name prompt.");
	}
	const onPress: unknown = buttons.find(
		(button) => button.text === actionLabel,
	)?.onPress;
	if (typeof onPress !== "function") {
		throw new Error(`Expected the ${actionLabel} prompt action.`);
	}
	return (value?: string) => onPress(value);
}

function pressAlertAction(actionLabel: string) {
	const buttons = mockAlert.mock.calls.at(-1)?.[2];
	const onPress = buttons?.find(
		(button) => button.text === actionLabel,
	)?.onPress;
	if (!onPress) throw new Error(`Expected the ${actionLabel} alert action.`);
	onPress();
}

async function confirmListDeletion(listName: string) {
	expect(mockAlert).toHaveBeenLastCalledWith(
		"Delete List",
		`Delete "${listName}"? Its Items will no longer be available.`,
		[
			{ text: "Cancel", style: "cancel" },
			expect.objectContaining({
				text: "Delete",
				style: "destructive",
				onPress: expect.any(Function),
			}),
		],
		{ userInterfaceStyle: "light" },
	);
	const buttons = mockAlert.mock.calls.at(-1)?.[2];
	const onPress = buttons?.find((button) => button.text === "Delete")?.onPress;
	if (!onPress) throw new Error("Expected the destructive Delete action.");
	await act(async () => onPress());
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

function showCollection(state: ListCollectionState): void {
	jest.mocked(useListCollection).mockReturnValue(collectionFixture(state));
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

function summariesFixture() {
	return [
		{
			...groceriesListSummary,
			uncheckedItemCount: 3,
			checkedItemCount: 2,
		},
		pantryListSummary,
	];
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

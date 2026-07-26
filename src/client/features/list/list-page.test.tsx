import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react-native";
import { useMemo, useState } from "react";
import { FlatList } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import type { ListSummary } from "@/client/features/list/list-service";
import {
	activeListPage,
	authenticatedAppSession,
	groceriesListSummary,
	pantryListSummary,
} from "@/client/features/list/list-test-support";
import { useListPage } from "@/client/features/list/use-list-page";
import { TestSafeAreaProvider } from "@/test/safe-area";
import { ListPage } from "./list-page";

jest.mock("@/client/features/list/use-list-page", () => ({
	useListPage: jest.fn(),
}));

beforeEach(() => {
	jest
		.mocked(useListPage)
		.mockImplementation((_session, summary) => activeListPage(summary));
});

describe("ListPage", () => {
	it("renders the active List surface", async () => {
		await render(<TestListPage focused summary={groceriesListSummary} />, {
			wrapper: TestSafeAreaProvider,
		});

		expect(await screen.findByText("No Items yet")).toBeTruthy();
	});

	it("resets both List pages to the toolbar inset when focus changes", async () => {
		const scrollToOffset = jest
			.spyOn(FlatList.prototype, "scrollToOffset")
			.mockImplementation();

		try {
			const view = await render(
				<TestListPages focusedListId="lst_groceries" />,
				{ wrapper: TestSafeAreaProvider },
			);
			await waitFor(() => {
				expect(scrollToOffset).toHaveBeenCalledWith({
					animated: false,
					offset: 0,
				});
			});
			expect(scrollToOffset).toHaveBeenCalledTimes(2);
			scrollToOffset.mockClear();

			await view.rerender(<TestListPages focusedListId="lst_pantry" />);

			await waitFor(() => {
				expect(scrollToOffset).toHaveBeenCalledWith({
					animated: false,
					offset: 0,
				});
			});
			expect(scrollToOffset).toHaveBeenCalledTimes(2);
		} finally {
			scrollToOffset.mockRestore();
		}
	});

	it("restores the initial List position when native content becomes scrollable", async () => {
		const scrollToOffset = jest
			.spyOn(FlatList.prototype, "scrollToOffset")
			.mockImplementation();

		try {
			await render(
				<TestListPage
					focused
					summary={groceriesListSummary}
					topContentInset={116}
				/>,
				{ wrapper: TestSafeAreaProvider },
			);
			scrollToOffset.mockClear();

			fireEvent(
				screen.getByTestId("home-list-items-lst_groceries"),
				"contentSizeChange",
				390,
				1200,
			);

			expect(scrollToOffset).toHaveBeenCalledWith({
				animated: false,
				offset: 0,
			});
		} finally {
			scrollToOffset.mockRestore();
		}
	});

	it("adds Items through the Current List action with normalized optional fields", async () => {
		const addItem = jest.fn(async () => undefined);
		jest
			.mocked(useListPage)
			.mockReturnValue(
				activeListPage(groceriesListSummary, { actions: { addItem } }),
			);
		await render(<TestListPage focused summary={groceriesListSummary} />, {
			wrapper: TestSafeAreaProvider,
		});

		expect(screen.queryByText("Add an Item…")).toBeNull();
		await fireEvent.press(
			await screen.findByRole("button", { name: "Add the first Item" }),
		);
		await fireEvent.changeText(
			await screen.findByLabelText("Item name"),
			" Milk ",
		);
		await fireEvent.press(
			await screen.findByRole("button", { name: "Add Item" }),
		);

		expect(addItem).toHaveBeenCalledWith({
			listId: "lst_groceries",
			name: "Milk",
			quantity: null,
			notes: null,
		});
	});

	it("keeps the focused List on its watched Item data", async () => {
		jest.mocked(useListPage).mockReturnValue(
			activeListPage(pantryListSummary, {
				list: {
					items: [
						{
							id: "itm_shelf_stable",
							name: "Shelf stable",
							quantity: null,
							notes: null,
							checked: false,
							checkedByMemberName: null,
						},
					],
				},
			}),
		);

		await render(<TestListPage focused summary={pantryListSummary} />, {
			wrapper: TestSafeAreaProvider,
		});

		expect(
			within(screen.getByTestId("home-list-items-lst_pantry")).getByText(
				"Shelf stable",
			),
		).toBeTruthy();
	});

	it("retries the failed page's Items query from its own error surface", async () => {
		const retry = jest.fn();
		jest.mocked(useListPage).mockReturnValue({
			status: "error",
			message: "Unable to load this List. Please try again.",
			retry,
		});

		await render(<TestListPage focused summary={groceriesListSummary} />, {
			wrapper: TestSafeAreaProvider,
		});

		await fireEvent.press(
			await screen.findByRole("button", { name: "Try again" }),
		);

		expect(retry).toHaveBeenCalledTimes(1);
	});
});

function TestListPages({ focusedListId }: { focusedListId: string }) {
	return (
		<>
			<TestListPage
				focused={focusedListId === groceriesListSummary.id}
				summary={groceriesListSummary}
				topContentInset={116}
			/>
			<TestListPage
				focused={focusedListId === pantryListSummary.id}
				summary={pantryListSummary}
				topContentInset={116}
			/>
		</>
	);
}

function TestListPage({
	focused,
	summary,
	topContentInset = 0,
}: {
	focused: boolean;
	summary: ListSummary;
	topContentInset?: number;
}) {
	const offsetY = useSharedValue(0);
	const largeTitleHeight = useSharedValue(0);
	const scrollState = useMemo(
		() => ({ offsetY, largeTitleHeight }),
		[offsetY, largeTitleHeight],
	);
	const [composerOpen, setComposerOpen] = useState(false);

	return (
		<ListPage
			composerOpen={composerOpen}
			focused={focused}
			listSummaries={[groceriesListSummary, pantryListSummary]}
			scrollState={scrollState}
			session={authenticatedAppSession}
			summary={summary}
			syncState="synced"
			topContentInset={topContentInset}
			onDismissComposer={() => setComposerOpen(false)}
			onOpenComposer={() => setComposerOpen(true)}
		/>
	);
}

import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActiveList } from "@/components/active-list";
import type { ActiveListSyncState, ActiveListSyncStatusSource } from "./types";

describe("ActiveList", () => {
	it("renders sync status updates from the provided status source", async () => {
		const syncStatus = controllableSyncStatus("pending");
		await renderActiveList({ syncStatus });

		expect(await screen.findByText("Pending sync")).toBeTruthy();

		await act(async () => syncStatus.emit("offline"));

		await waitFor(() =>
			expect(screen.getByText("Offline - changes saved locally")).toBeTruthy(),
		);
	});

	it("adds Items through the provided action without a manual sync request", async () => {
		const onAddItem = jest.fn(async () => undefined);
		await renderActiveList({ onAddItem });

		await fireEvent.press(await screen.findByText("Add Item"));
		await fireEvent.changeText(
			await screen.findByLabelText("Item name"),
			" Milk ",
		);
		await fireEvent.press(await screen.findByLabelText("Submit Item"));

		await waitFor(() => {
			expect(onAddItem).toHaveBeenCalledWith({
				name: "Milk",
				quantity: null,
				notes: null,
			});
		});
	});
});

function renderActiveList(options: {
	syncStatus?: ActiveListSyncStatusSource;
	onAddItem?: (input: {
		name: string;
		quantity: string | null;
		notes: string | null;
	}) => Promise<void>;
}) {
	return render(
		<ActiveList.Provider
			state={{
				householdName: "Avery",
				listName: "Groceries",
				items: [
					{
						id: "itm_milk",
						name: "Milk",
						quantity: null,
						notes: null,
						checked: false,
						checkedByMemberName: null,
					},
				],
			}}
			currentMemberName="Avery"
			onAddItem={options.onAddItem ?? jest.fn(async () => undefined)}
			onSetItemChecked={jest.fn(async () => undefined)}
			syncStatus={options.syncStatus ?? passiveSyncStatus()}
		>
			<ActiveList.Screen>
				<ActiveList.Header />
				<ActiveList.Items />
				<ActiveList.AddItemForm />
			</ActiveList.Screen>
		</ActiveList.Provider>,
		{ wrapper: TestSafeAreaProvider },
	);
}

function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 0, left: 0, right: 0, bottom: 24 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

function passiveSyncStatus(
	status: ActiveListSyncState = "synced",
): ActiveListSyncStatusSource {
	return {
		getStatus: () => status,
		subscribe: () => ({ remove() {} }),
	};
}

function controllableSyncStatus(initialStatus: ActiveListSyncState) {
	let status = initialStatus;
	const listeners = new Set<() => void>();
	const source: ActiveListSyncStatusSource & {
		emit: (nextStatus: ActiveListSyncState) => void;
	} = {
		getStatus: () => status,
		subscribe(listener) {
			listeners.add(listener);
			return {
				remove() {
					listeners.delete(listener);
				},
			};
		},
		emit(nextStatus) {
			status = nextStatus;
			for (const listener of listeners) listener();
		},
	};
	return source;
}

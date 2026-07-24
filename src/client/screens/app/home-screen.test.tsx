import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { AuthenticatedAppSession } from "@/client/session";
import type { HomeCurrentListDeps } from "@/client/features/list/current-list";
import { HomeScreenView } from "./home-screen";

jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/client/session/powersync", () => ({
	PowerSyncConnector: jest.fn(),
	powerSyncAppDatabase: {},
	readPowerSyncUrl: jest.fn(() => "https://sync.test"),
}));

describe("HomeScreenView", () => {
	it("renders the loading Authenticated App Session state", async () => {
		await render(
			<HomeScreenView state={{ status: "loading" }} session={null} />,
		);

		expect(await screen.findByText("Preparing your Household")).toBeTruthy();
	});

	it("renders the retry action for Authenticated App Session errors", async () => {
		const onRetry = jest.fn();
		await render(
			<HomeScreenView
				state={{ status: "error", message: "Unable to prepare." }}
				session={null}
				onRetry={onRetry}
			/>,
		);

		await fireEvent.press(await screen.findByText("Try again"));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("adds Items through the Current List action with normalized optional fields", async () => {
		const addItem = jest.fn(async () => undefined);
		const currentListDeps: HomeCurrentListDeps = {
			currentList: {
				state: {
					status: "active",
					listId: "lst_groceries",
					list: {
						householdName: "Avery",
						listName: "Groceries",
						items: [],
					},
					actions: {
						addItem,
						setItemChecked: jest.fn(async () => undefined),
					},
				},
				retry: jest.fn(),
				reload: jest.fn(),
			},
			syncState: "synced",
		};

		await render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={sessionFixture()}
				currentListDeps={currentListDeps}
				onOpenNavigation={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		await fireEvent(await screen.findByLabelText("Add Item"), "focus");
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
});

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{
				id: "hh_avery",
				name: "Avery",
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
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
	};
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

import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { AuthenticatedAppSession } from "@/client/session";
import { CurrentList, type HomeCurrentListDeps } from "./current-list";
import { emptyActiveListState } from "./list-test-support";

describe("CurrentList", () => {
	it.each([
		{
			name: "active",
			deps: activeListDeps(),
			visibleText: "No Items yet",
		},
		{
			name: "zero-active",
			deps: zeroActiveListDeps(),
			visibleText: "No active Lists",
		},
	])("does not wire Lists entry points for injected $name state", async ({
		deps,
		visibleText,
	}) => {
		await render(
			<CurrentList
				session={sessionFixture()}
				deps={deps}
				onOpenNavigation={jest.fn()}
				onOpenLists={jest.fn()}
			/>,
			{ wrapper: TestSafeAreaProvider },
		);

		expect(await screen.findByText(visibleText)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Switch List" })).toBeNull();
		expect(screen.queryByLabelText("List name")).toBeNull();
	});
});

function activeListDeps(): HomeCurrentListDeps {
	return {
		currentList: {
			state: {
				status: "active",
				listId: "lst_groceries",
				list: emptyActiveListState,
				actions: {
					addItem: jest.fn(async () => undefined),
					setItemChecked: jest.fn(async () => undefined),
				},
			},
			retry: jest.fn(),
			reload: jest.fn(),
		},
		syncState: "synced",
	};
}

function zeroActiveListDeps(): HomeCurrentListDeps {
	return {
		currentList: {
			state: { status: "zeroActive" },
			retry: jest.fn(),
			reload: jest.fn(),
		},
		syncState: "synced",
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

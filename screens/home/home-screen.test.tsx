import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import type { ActiveListInitialState } from "@/components/active-list";
import { useAuthenticatedAppSession } from "@/components/session";
import {
	type PrimaryHouseholdScenario,
	seedPrimaryHouseholdScenario,
} from "@/db/fixtures";
import type { TestDirectoryDb, TestHouseholdDb } from "@/db/test";
import { createTestDirectoryDb, createTestHouseholdDb } from "@/db/test";
import { DEFAULT_LIST_ID } from "@/lib/bootstrap";
import type { Logger } from "@/lib/logger";
import type { AuthenticatedAppSession } from "@/lib/services/session";
import { createSessionDataServices } from "@/lib/services/session/services";
import {
	authenticatedAppSessionFixture,
	itemServiceFixture,
	listServiceFixture,
	sessionItemFixture,
	sessionListFixture,
	syncCoordinatorFixture,
} from "@/lib/services/session/test-fixtures";
import HomeScreen, { HomeScreenView } from "@/screens/home/home-screen";

jest.mock("@/components/session", () => ({
	useAuthenticatedAppSession: jest.fn(),
}));

jest.mock("@/lib/analytics", () => ({
	track: jest.fn(),
}));

jest.mock("@/lib/logger", () => {
	const logger = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		with: jest.fn(),
	};
	logger.with.mockReturnValue(logger);
	return {
		logger,
		useLogger: jest.fn(() => logger),
	};
});

const testLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	with: jest.fn(),
} satisfies jest.Mocked<Logger>;
testLogger.with.mockImplementation(() => testLogger);

describe("HomeScreen", () => {
	beforeEach(() => {
		testLogger.debug.mockReset();
		testLogger.info.mockReset();
		testLogger.warn.mockReset();
		testLogger.error.mockReset();
		testLogger.with.mockClear();
		testLogger.with.mockImplementation(() => testLogger);
	});

	it("renders provider-derived loading state", () => {
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "loading" },
			session: null,
			retry: jest.fn(),
			signOut: jest.fn(async () => undefined),
		});

		render(<HomeScreen />);

		expect(screen.getByText("Preparing your Household")).toBeTruthy();
	});

	it("renders provider-derived ready state", async () => {
		const harness = await createHomeSessionHarness();
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: { status: "ready", refreshing: false },
			session: harness.session,
			retry: jest.fn(),
			signOut: jest.fn(async () => undefined),
		});

		try {
			render(<HomeScreen />);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(screen.getByText("Milk")).toBeTruthy();
		} finally {
			await harness.close();
		}
	});

	it("wires retry and sign out actions from the provider", () => {
		const retry = jest.fn();
		const signOut = jest.fn(async () => undefined);
		jest.mocked(useAuthenticatedAppSession).mockReturnValue({
			state: {
				status: "error",
				message: "Unable to prepare your Household. Please try again.",
			},
			session: null,
			retry,
			signOut,
		});

		render(<HomeScreen />);

		fireEvent.press(screen.getByText("Try again"));
		fireEvent.press(screen.getByText("Sign out"));
		expect(retry).toHaveBeenCalledTimes(1);
		expect(signOut).toHaveBeenCalledTimes(1);
	});
});

it("remounts Active List when the session resource changes", async () => {
	const { rerender } = render(
		<HomeScreenView
			state={{ status: "ready", refreshing: false }}
			session={controlledSession({
				resourceKey: "authenticated-app-session:1",
				initialList: initialListFixture({ itemName: "Cached Milk" }),
			})}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Cached Milk")).toBeTruthy());
	rerender(
		<HomeScreenView
			state={{ status: "ready", refreshing: false }}
			session={controlledSession({
				resourceKey: "authenticated-app-session:2",
				initialList: initialListFixture({ itemName: "Fresh Eggs" }),
			})}
		/>,
	);

	await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());
	expect(screen.queryByText("Cached Milk")).toBeNull();
});

describe("HomeScreenView", () => {
	it("shows Authenticated App Session loading and retryable error states", () => {
		const retry = jest.fn();

		const { rerender } = render(
			<HomeScreenView state={{ status: "loading" }} session={null} />,
		);
		expect(screen.getByText("Preparing your Household")).toBeTruthy();

		rerender(
			<HomeScreenView
				state={{
					status: "error",
					message: "Unable to prepare your Household. Please try again.",
				}}
				session={null}
				onRetry={retry}
			/>,
		);

		fireEvent.press(screen.getByText("Try again"));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("renders Active List data from seeded session services", async () => {
		const harness = await createHomeSessionHarness();

		try {
			render(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Avery")).toBeTruthy());
			expect(screen.getByText("Groceries")).toBeTruthy();
			expect(screen.getByText("Milk")).toBeTruthy();
			expect(screen.getByText("Eggs")).toBeTruthy();
			expect(screen.getByText("Bread")).toBeTruthy();
			expect(screen.getByText("Checked by Avery Chen")).toBeTruthy();
			expect(screen.getByText("Checked by Blake Rivera")).toBeTruthy();
			expect(screen.queryByText("Coffee")).toBeNull();
		} finally {
			await harness.close();
		}
	});

	it("uses active Member fallback name for checked Item display", async () => {
		const harness = await createHomeSessionHarness();
		harness.session.activeMember.displayName = null;
		harness.session.members = harness.session.members.map((member) =>
			member.userId === harness.session.activeMember.userId
				? { ...member, displayName: null }
				: member,
		);

		try {
			render(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() =>
				expect(screen.getByText("Checked by Avery Chen")).toBeTruthy(),
			);
		} finally {
			await harness.close();
		}
	});

	it("shows a retryable List error when list loading fails", async () => {
		const session = controlledSession();
		jest
			.mocked(session.services.lists.getList)
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(sessionListFixture());

		render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={session}
			/>,
		);

		await waitFor(() =>
			expect(screen.getByText("List unavailable")).toBeTruthy(),
		);
		fireEvent.press(screen.getByText("Try again"));

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(session.services.lists.getList).toHaveBeenCalledTimes(2);
	});

	it("loads the default List from the seeded Household DB after authenticated app session context exists", async () => {
		const harness = await createHomeSessionHarness();

		try {
			render(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);

			await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
			expect(harness.scenario.lists.groceries.id).toBe(DEFAULT_LIST_ID);
		} finally {
			await harness.close();
		}
	});

	it("persists Item add and checked state through seeded session services", async () => {
		const harness = await createHomeSessionHarness();

		try {
			render(
				<HomeScreenView
					state={{ status: "ready", refreshing: false }}
					session={harness.session}
				/>,
			);
			await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

			fireEvent.changeText(
				screen.getByPlaceholderText("Add an Item"),
				"Yogurt",
			);
			await act(async () => {
				fireEvent.press(screen.getByText("Add"));
			});
			await waitFor(() => expect(screen.getByText("Yogurt")).toBeTruthy());
			await act(async () => {
				fireEvent.press(screen.getByRole("checkbox", { name: "Yogurt" }));
			});

			const persistedItem = await harness.household.db.query.items.findFirst({
				where: (table, { eq }) => eq(table.name, "Yogurt"),
			});
			expect(persistedItem).toBeDefined();
			if (!persistedItem) throw new Error("Expected persisted Item");
			expect(persistedItem).toMatchObject({
				listId: DEFAULT_LIST_ID,
				name: "Yogurt",
				createdByUserId: harness.scenario.users.avery.id,
			});
			await expect(
				harness.household.db.query.itemChecks.findFirst({
					where: (table, { eq }) => eq(table.itemId, persistedItem.id),
				}),
			).resolves.toMatchObject({
				itemId: persistedItem.id,
				userId: harness.scenario.users.avery.id,
				checkedAt: expect.any(Number),
			});
		} finally {
			await harness.close();
		}
	});

	it("ignores stale List loads after the session resource changes", async () => {
		const staleLoad = deferred<ReturnType<typeof sessionListFixture>>();
		const freshLoad = deferred<ReturnType<typeof sessionListFixture>>();
		const { rerender } = render(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={controlledSession({
					resourceKey: "authenticated-app-session:1",
					lists: listServiceFixture({
						getList: jest.fn(() => staleLoad.promise),
					}),
				})}
			/>,
		);

		rerender(
			<HomeScreenView
				state={{ status: "ready", refreshing: false }}
				session={controlledSession({
					resourceKey: "authenticated-app-session:2",
					initialList: initialListFixture({ itemName: "Fresh Eggs" }),
					lists: listServiceFixture({
						getList: jest.fn(() => freshLoad.promise),
					}),
				})}
			/>,
		);

		await act(async () => {
			freshLoad.resolve(sessionListFixture());
			await freshLoad.promise;
		});
		await waitFor(() => expect(screen.getByText("Fresh Eggs")).toBeTruthy());

		await act(async () => {
			staleLoad.resolve(sessionListFixture({ name: "Stale" }));
			await staleLoad.promise;
		});
		expect(screen.queryByText("Stale")).toBeNull();
		expect(screen.getByText("Fresh Eggs")).toBeTruthy();
	});
});

type HomeSessionHarness = {
	directory: TestDirectoryDb;
	household: TestHouseholdDb;
	scenario: PrimaryHouseholdScenario;
	session: AuthenticatedAppSession;
	close: () => Promise<void>;
};

async function createHomeSessionHarness(): Promise<HomeSessionHarness> {
	const directory = await createTestDirectoryDb();
	const household = await createTestHouseholdDb();
	const scenario = await seedPrimaryHouseholdScenario({
		directory: directory.db,
		household: household.db,
	});
	const dataServices = await createSessionDataServices(
		{
			householdId: scenario.household.id,
			database: { url: "libsql://example", authToken: "secret" },
			logger: testLogger,
		},
		{
			store: {
				syncAuthorized: true,
				execute: household.client.execute.bind(household.client),
				push: jest.fn(async () => undefined),
				sync: jest.fn(async () => ({ changed: false })),
				close: jest.fn(async () => undefined),
			},
		},
	);
	const session: AuthenticatedAppSession = {
		user: {
			id: scenario.users.avery.id,
			email: scenario.users.avery.email ?? null,
			displayName: scenario.users.avery.displayName ?? null,
		},
		activeHousehold: {
			id: scenario.household.id,
			name: scenario.household.name,
		},
		activeMember: {
			id: scenario.members.avery.id,
			userId: scenario.users.avery.id,
			role: scenario.members.avery.role,
			displayName: scenario.users.avery.displayName ?? null,
		},
		members: [
			{
				membershipId: scenario.members.avery.id,
				userId: scenario.users.avery.id,
				role: scenario.members.avery.role,
				displayName: scenario.users.avery.displayName ?? null,
			},
			{
				membershipId: scenario.members.blake.id,
				userId: scenario.users.blake.id,
				role: scenario.members.blake.role,
				displayName: scenario.users.blake.displayName ?? null,
			},
		],
		resourceKey: "authenticated-app-session:seeded",
		services: {
			lists: dataServices.lists,
			items: dataServices.items,
			sync: syncCoordinatorFixture(),
		},
	};

	return {
		directory,
		household,
		scenario,
		session,
		async close() {
			await dataServices.close();
			await directory.close();
			await household.close();
		},
	};
}

type ControlledSessionOverrides = {
	resourceKey?: string;
	initialList?: ActiveListInitialState;
	lists?: ReturnType<typeof listServiceFixture>;
	items?: ReturnType<typeof itemServiceFixture>;
	sync?: ReturnType<typeof syncCoordinatorFixture>;
};

function controlledSession(
	overrides: ControlledSessionOverrides = {},
): AuthenticatedAppSession {
	const initialList = overrides.initialList ?? initialListFixture();
	return authenticatedAppSessionFixture({
		activeHousehold: { id: "hh_avery", name: initialList.householdName },
		resourceKey: overrides.resourceKey,
		services: {
			lists:
				overrides.lists ??
				listServiceFixture({
					getList: jest
						.fn()
						.mockResolvedValue(
							sessionListFixture({ name: initialList.listName }),
						),
				}),
			items:
				overrides.items ??
				itemServiceFixture({
					listItems: jest.fn().mockResolvedValue(
						initialList.items.map((item, index) =>
							sessionItemFixture({
								id: item.id,
								name: item.name,
								checked: item.checked,
								checkedByUserId: item.checked ? "usr_avery" : null,
								position: index,
							}),
						),
					),
				}),
			sync: overrides.sync ?? syncCoordinatorFixture(),
		},
	});
}

function initialListFixture(
	overrides: {
		checked?: boolean;
		checkedByMemberName?: string | null;
		householdName?: string;
		itemName?: string;
		items?: ActiveListInitialState["items"];
		listName?: string;
	} = {},
): ActiveListInitialState {
	return {
		householdName: overrides.householdName ?? "Avery",
		listName: overrides.listName ?? "Groceries",
		items: overrides.items ?? [
			{
				id: "itm_milk",
				name: overrides.itemName ?? "Milk",
				checked: overrides.checked ?? false,
				checkedByMemberName: overrides.checkedByMemberName ?? null,
			},
		],
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

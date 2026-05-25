import type { ActiveListInitialState } from "@/components/active-list";
import {
	activeListDataSourceFixture,
	cachedHouseholdSessionFixture,
	householdSessionFixture,
	initialListFixture,
	syncCoordinatorFixture,
} from "@/db/fixtures/active-household";
import type { Logger } from "@/lib/logger";
import {
	type ActiveHouseholdSnapshot,
	createActiveHouseholdController,
} from "./active-household-controller";
import type {
	CachedHouseholdSession,
	HouseholdSession,
	HouseholdSessionService,
} from "./household-session-service";

describe("createActiveHouseholdController", () => {
	it("publishes a ready Active Household view from a fresh Household Session", async () => {
		const dataSource = activeListDataSourceFixture();
		const syncCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});
		const snapshots = collectSnapshots(controller);

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(snapshots.map((snapshot) => snapshot.status)).toEqual([
			"idle",
			"loading",
			"ready",
		]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: {
				activeMemberName: "Avery Chen",
				currentList: {
					initialState: {
						householdName: "Avery",
						listName: "Groceries",
						items: [{ name: "Milk" }],
					},
					syncCoordinator,
				},
			},
		});
		expect(syncCoordinator.start).toHaveBeenCalledTimes(1);
	});

	it("publishes loading and error snapshots when fresh activation fails", async () => {
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				getHouseholdSession: jest.fn().mockRejectedValue(new Error("offline")),
			}),
			logger: loggerFixture(),
		});
		const snapshots = collectSnapshots(controller);

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(snapshots).toEqual([
			{ status: "idle" },
			{ status: "loading" },
			{
				status: "error",
				message: "Unable to prepare your Household. Please try again.",
			},
		]);
	});

	it("disposes the active resource and publishes idle", async () => {
		const dataSource = activeListDataSourceFixture();
		const syncCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await controller.dispose();

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(syncCoordinator.stop).toHaveBeenCalledTimes(1);
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("publishes cached Current List state without starting authorized sync", async () => {
		const cached = cachedHouseholdSessionFixture();
		const dataSource = activeListDataSourceFixture({ syncAuthorized: false });
		const syncCoordinator = syncCoordinatorFixture();
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: false,
			signedIn: false,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: {
				currentList: { initialState: { householdName: "Avery" } },
			},
		});
		expect(sessionService.getHouseholdSession).not.toHaveBeenCalled();
		expect(syncCoordinator.start).not.toHaveBeenCalled();
	});

	it("publishes an error when cached Current List loading fails and fresh is unavailable", async () => {
		const dataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest.fn().mockRejectedValue(new Error("cached load failed")),
		});
		const syncCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn().mockRejectedValue(new Error("offline")),
			}),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({ status: "error" });
		expect(syncCoordinator.start).not.toHaveBeenCalled();
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("deletes unauthorized cached Household data before publishing fresh state", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = deferred<HouseholdSession>();
		const events: string[] = [];
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "New" })),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn(() => freshSession.promise),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
			deleteCachedHouseholdSessionLocalData: jest.fn(async () => {
				events.push("delete:cached");
			}),
			clearUnauthorizedCachedHouseholdSessionMetadata: jest.fn(async () => {
				events.push("clear:cached");
			}),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { currentList: { initialState: { householdName: "Old" } } },
			}),
		);

		freshSession.resolve(fresh);
		await activation;

		expect(events).toEqual(["close:cached", "delete:cached", "clear:cached"]);
		expect(
			sessionService.readUnauthorizedCachedHouseholdSession,
		).toHaveBeenCalledWith(fresh);
		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).toHaveBeenCalledWith(cached);
		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).toHaveBeenCalledWith(cached, fresh);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "New" } } },
		});
	});

	it("closes a pending unauthorized cached resource before deleting local data", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedLoad = deferred<ActiveListInitialState>();
		const freshSession = deferred<HouseholdSession>();
		const events: string[] = [];
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest.fn(() => cachedLoad.promise),
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "New" })),
		});
		const cachedCoordinator = syncCoordinatorFixture();
		cachedCoordinator.stop = jest.fn(async () => {
			events.push("stop:cached");
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn(() => freshSession.promise),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
			deleteCachedHouseholdSessionLocalData: jest.fn(async () => {
				events.push("delete:cached");
			}),
			clearUnauthorizedCachedHouseholdSessionMetadata: jest.fn(async () => {
				events.push("clear:cached");
			}),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() => expect(cachedDataSource.load).toHaveBeenCalled());

		freshSession.resolve(fresh);
		await Promise.resolve();
		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).not.toHaveBeenCalled();

		cachedLoad.resolve(initialListFixture({ householdName: "Old" }));
		await activation;

		expect(cachedCoordinator.stop).toHaveBeenCalledTimes(1);
		expect(events).toEqual([
			"stop:cached",
			"close:cached",
			"delete:cached",
			"clear:cached",
		]);
	});

	it("does not delete unauthorized cached data when closing a pending resource fails", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedLoad = deferred<ActiveListInitialState>();
		const freshSession = deferred<HouseholdSession>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest.fn(() => cachedLoad.promise),
			close: jest.fn(async () => {
				throw new Error("close failed");
			}),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn(() => freshSession.promise),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest.fn().mockReturnValue(cachedDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() => expect(cachedDataSource.load).toHaveBeenCalled());

		freshSession.resolve(fresh);
		cachedLoad.resolve(initialListFixture({ householdName: "Old" }));
		await activation;

		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).not.toHaveBeenCalled();
		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toEqual({
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		});
	});

	it("publishes an error when unauthorized cached cleanup fails after cached state was published", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = deferred<HouseholdSession>();
		const firstCachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
		});
		const secondCachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn(() => freshSession.promise),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
			deleteCachedHouseholdSessionLocalData: jest.fn(async () => {
				throw new Error("delete failed");
			}),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(firstCachedDataSource)
				.mockReturnValueOnce(secondCachedDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Old" } } },
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(secondCachedDataSource.load).toHaveBeenCalled(),
		);

		freshSession.resolve(fresh);
		await activation;

		expect(controller.getSnapshot()).toEqual({
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		});
		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).not.toHaveBeenCalled();
	});

	it("rejects new operations on an unauthorized cached resource after invalidation", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "New" })),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValueOnce(cached)
					.mockResolvedValueOnce(null),
				getHouseholdSession: jest.fn().mockResolvedValue(fresh),
				readUnauthorizedCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cached),
			}),
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});
		const cachedSnapshot = controller.getSnapshot();
		if (cachedSnapshot.status !== "ready") {
			throw new Error("Expected cached ready");
		}

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		await expect(
			cachedSnapshot.view.currentList.dataSource.addItem("Milk"),
		).rejects.toMatchObject({ code: "stale_current_list_resource" });
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "New" } } },
		});
	});

	it("rejects new unauthorized cached operations before local deletion starts", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const deleteCached = deferred<void>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "New" })),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValueOnce(null),
			getHouseholdSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
			deleteCachedHouseholdSessionLocalData: jest.fn(
				() => deleteCached.promise,
			),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});
		const cachedSnapshot = controller.getSnapshot();
		if (cachedSnapshot.status !== "ready") {
			throw new Error("Expected cached ready");
		}

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(
				sessionService.deleteCachedHouseholdSessionLocalData,
			).toHaveBeenCalledWith(cached),
		);

		await expect(
			cachedSnapshot.view.currentList.dataSource.addItem("Milk"),
		).rejects.toMatchObject({ code: "stale_current_list_resource" });
		expect(freshDataSource.load).not.toHaveBeenCalled();

		deleteCached.resolve(undefined);
		await activation;
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "New" } } },
		});
	});

	it("cancels unauthorized cached deletion when a newer activation starts", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const firstFresh = householdSessionFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondFresh = householdSessionFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const closeCached = deferred<void>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
			close: jest.fn(() => closeCached.promise),
		});
		const firstFreshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "First" })),
		});
		const secondFreshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Second" })),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValue(null),
			getHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(firstFresh)
				.mockResolvedValueOnce(secondFresh),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValueOnce(null),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(secondFreshDataSource)
				.mockReturnValueOnce(firstFreshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});
		const staleActivation = controller.activate({
			getToken: async () => "stale-token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() => expect(cachedDataSource.close).toHaveBeenCalled());

		const freshActivation = controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});
		closeCached.resolve(undefined);
		await Promise.all([staleActivation, freshActivation]);

		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).not.toHaveBeenCalled();
		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Second" } } },
		});
	});

	it("cancels unauthorized metadata clearing when a newer activation starts during deletion", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const firstFresh = householdSessionFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondFresh = householdSessionFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const deleteCached = deferred<void>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
		});
		const secondFreshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Second" })),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValue(null),
			getHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(firstFresh)
				.mockResolvedValueOnce(secondFresh),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValueOnce(null),
			deleteCachedHouseholdSessionLocalData: jest.fn(
				() => deleteCached.promise,
			),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(secondFreshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});
		const staleActivation = controller.activate({
			getToken: async () => "stale-token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(
				sessionService.deleteCachedHouseholdSessionLocalData,
			).toHaveBeenCalledWith(cached),
		);

		const freshActivation = controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});
		deleteCached.resolve(undefined);
		await Promise.all([staleActivation, freshActivation]);

		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Second" } } },
		});
	});

	it("does not resurrect unauthorized cached data when fresh opening fails", async () => {
		const cached = cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Old" })),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest.fn().mockRejectedValue(new Error("fresh open failed")),
		});
		const sessionService = sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toEqual({
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		});
		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).toHaveBeenCalledWith(cached);
		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).toHaveBeenCalledWith(cached, fresh);
	});

	it("publishes fresh state before retiring the previous cached resource", async () => {
		const events: string[] = [];
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Cached" })),
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Fresh" })),
		});
		const cachedCoordinator = syncCoordinatorFixture();
		const freshCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
			}),
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(freshCoordinator),
			logger: loggerFixture(),
		});
		controller.subscribe((snapshot) => {
			if (snapshot.status === "ready") {
				events.push(
					`publish:${snapshot.view.currentList.initialState.householdName}`,
				);
			}
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(events).toEqual(["publish:Cached", "publish:Fresh", "close:cached"]);
	});

	it("keeps the cached view published while fresh resources open", async () => {
		const freshLoad = deferred<ActiveListInitialState>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Cached" })),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest.fn(() => freshLoad.promise),
		});
		const freshSession = deferred<HouseholdSession>();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn(() => freshSession.promise),
			}),
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { currentList: { initialState: { householdName: "Cached" } } },
			}),
		);

		freshSession.resolve(householdSessionFixture({ householdName: "Fresh" }));
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "loading",
				refreshingSession: true,
				previous: {
					currentList: { initialState: { householdName: "Cached" } },
				},
			}),
		);
		const loading = controller.getSnapshot();
		if (loading.status !== "loading" || !loading.previous) {
			throw new Error("Expected loading snapshot with previous view");
		}
		await expect(
			loading.previous.currentList.dataSource.addItem("Cached eggs"),
		).resolves.toBeUndefined();

		freshLoad.resolve(initialListFixture({ householdName: "Fresh" }));
		await activation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Fresh" } } },
		});
	});

	it("keeps an existing cached view visible during a later signed-in replacement activation", async () => {
		const freshSession = deferred<HouseholdSession>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Cached" })),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValueOnce(cachedHouseholdSessionFixture())
					.mockResolvedValueOnce(null),
				getHouseholdSession: jest.fn(() => freshSession.promise),
			}),
			createCurrentListDataSource: jest.fn().mockReturnValue(cachedDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: false,
			signedIn: false,
		});
		const cached = controller.getSnapshot();
		if (cached.status !== "ready") throw new Error("Expected cached ready");

		const replacement = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "loading",
				refreshingSession: true,
				previous: {
					currentList: { initialState: { householdName: "Cached" } },
				},
			}),
		);
		const loading = controller.getSnapshot();
		if (loading.status !== "loading" || !loading.previous) {
			throw new Error("Expected loading snapshot with previous view");
		}
		await expect(
			loading.previous.currentList.dataSource.addItem("Cached eggs"),
		).resolves.toBeUndefined();

		freshSession.reject(new Error("offline"));
		await replacement;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Cached" } } },
		});
	});

	it("publishes a new opaque Current List resource key when fresh resources replace cached resources", async () => {
		const keys: string[] = [];
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Cached" })),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Fresh" })),
		});
		const cachedCoordinator = syncCoordinatorFixture();
		const freshCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
			}),
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(freshCoordinator),
			logger: loggerFixture(),
		});
		controller.subscribe((snapshot) => {
			if (snapshot.status === "ready") {
				keys.push(snapshot.view.currentList.resourceKey);
			}
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(keys).toEqual(["current-list:1", "current-list:2"]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: {
				currentList: {
					resourceKey: "current-list:2",
					initialState: { householdName: "Fresh" },
				},
			},
		});
		const final = controller.getSnapshot();
		if (final.status !== "ready") throw new Error("Expected ready snapshot");
		await final.view.currentList.dataSource.addItem("Fresh milk");
		expect(freshDataSource.addItem).toHaveBeenCalledWith("Fresh milk");
		expect(cachedDataSource.addItem).not.toHaveBeenCalled();
		expect(final.view.currentList.syncCoordinator).toBe(freshCoordinator);
		expect(cachedCoordinator.start).not.toHaveBeenCalled();
		expect(freshCoordinator.start).toHaveBeenCalledTimes(1);
	});

	it("keeps cached Current List state when fresh loading fails", async () => {
		const dataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			addItem: jest.fn().mockResolvedValue({
				id: "itm_cached",
				name: "Cached eggs",
				checked: false,
				checkedByMemberName: null,
			}),
		});
		const syncCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn().mockRejectedValue(new Error("offline")),
			}),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: {
				currentList: { initialState: { householdName: "Avery" } },
			},
		});
		const snapshot = controller.getSnapshot();
		if (snapshot.status !== "ready") throw new Error("Expected cached ready");
		await expect(
			snapshot.view.currentList.dataSource.addItem("Cached eggs"),
		).resolves.toMatchObject({ name: "Cached eggs" });
		expect(syncCoordinator.start).not.toHaveBeenCalled();
		expect(syncCoordinator.stop).not.toHaveBeenCalled();
		expect(dataSource.close).not.toHaveBeenCalled();
	});

	it("does not let a slow cached load replace a published fresh resource", async () => {
		const cachedLoad = deferred<ActiveListInitialState>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest.fn(() => cachedLoad.promise),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Fresh" })),
		});
		const freshCoordinator = syncCoordinatorFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
				getHouseholdSession: jest
					.fn()
					.mockResolvedValue(
						householdSessionFixture({ householdName: "Fresh" }),
					),
			}),
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(syncCoordinatorFixture())
				.mockReturnValueOnce(freshCoordinator),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { currentList: { initialState: { householdName: "Fresh" } } },
			}),
		);

		cachedLoad.resolve(initialListFixture({ householdName: "Cached" }));
		await activation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Fresh" } } },
		});
		expect(freshCoordinator.stop).not.toHaveBeenCalled();
		expect(freshDataSource.close).not.toHaveBeenCalled();
		await waitForAsync(() =>
			expect(cachedDataSource.close).toHaveBeenCalledTimes(1),
		);
	});

	it("publishes an error when signed out and no cached Household Session is available", async () => {
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});

		expect(controller.getSnapshot()).toMatchObject({ status: "error" });
	});

	it("ignores stale activation completion without closing the newer resource or saving stale cache", async () => {
		const staleLoad = deferred<ActiveListInitialState>();
		const staleDataSource = activeListDataSourceFixture({
			load: jest.fn(() => staleLoad.promise),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(
					initialListFixture({ householdName: "Fresh", itemName: "Eggs" }),
				),
		});
		const staleCoordinator = syncCoordinatorFixture();
		const freshCoordinator = syncCoordinatorFixture();
		const sessionService = sessionServiceFixture({
			getHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(
					householdSessionFixture({ householdName: "Stale" }),
				)
				.mockResolvedValueOnce(
					householdSessionFixture({ householdName: "Fresh" }),
				),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(staleDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(staleCoordinator)
				.mockReturnValueOnce(freshCoordinator),
			logger: loggerFixture(),
		});

		const staleActivation = controller.activate({
			getToken: async () => "stale-token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() => expect(staleDataSource.load).toHaveBeenCalled());
		await controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Fresh" } } },
		});
		staleLoad.resolve(initialListFixture({ householdName: "Stale" }));
		await staleActivation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Fresh" } } },
		});
		expect(freshCoordinator.stop).not.toHaveBeenCalled();
		expect(freshDataSource.close).not.toHaveBeenCalled();
		expect(staleCoordinator.start).not.toHaveBeenCalled();
		expect(staleCoordinator.stop).toHaveBeenCalledTimes(1);
		expect(staleDataSource.close).toHaveBeenCalledTimes(1);
		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledTimes(1);
		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledWith(
			expect.objectContaining({
				activeHousehold: { id: "hh_avery", name: "Fresh" },
			}),
		);
	});

	it("serializes cache writes so a stale in-flight save cannot overwrite fresh cache", async () => {
		const staleSave = deferred<CachedHouseholdSession>();
		const savedHouseholdNames: string[] = [];
		const sessionService = sessionServiceFixture({
			getHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(
					householdSessionFixture({ householdName: "Stale" }),
				)
				.mockResolvedValueOnce(
					householdSessionFixture({ householdName: "Fresh" }),
				),
		});
		sessionService.saveCachedHouseholdSession = jest
			.fn()
			.mockImplementationOnce(async (session: HouseholdSession) => {
				savedHouseholdNames.push(session.activeHousehold.name);
				return staleSave.promise;
			})
			.mockImplementationOnce(async (session: HouseholdSession) => {
				savedHouseholdNames.push(session.activeHousehold.name);
				return cachedHouseholdSessionFixture();
			});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValue(activeListDataSourceFixture()),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const staleActivation = controller.activate({
			getToken: async () => "stale-token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() => expect(savedHouseholdNames).toEqual(["Stale"]));
		const freshActivation = controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});
		await Promise.resolve();
		expect(savedHouseholdNames).toEqual(["Stale"]);

		staleSave.resolve(cachedHouseholdSessionFixture());
		await Promise.all([staleActivation, freshActivation]);

		expect(savedHouseholdNames).toEqual(["Stale", "Fresh"]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Avery" } } },
		});
	});

	it("waits for an accepted Current List write before closing a retired resource", async () => {
		const events: string[] = [];
		const write = deferred<{
			id: string;
			name: string;
			checked: boolean;
			checkedByMemberName: null;
		}>();
		const cachedDataSource = activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Cached" })),
			addItem: jest.fn(() =>
				write.promise.then((item) => {
					events.push("write:cached");
					return item;
				}),
			),
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataSource = activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(initialListFixture({ householdName: "Fresh" })),
		});
		const cachedCoordinator = syncCoordinatorFixture();
		cachedCoordinator.stop = jest.fn(async () => {
			events.push("stop:cached");
		});
		const freshSession = deferred<HouseholdSession>();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn(() => freshSession.promise),
			}),
			createCurrentListDataSource: jest.fn((config) =>
				config.database.authToken ? freshDataSource : cachedDataSource,
			),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { currentList: { initialState: { householdName: "Cached" } } },
			}),
		);
		const cachedView = controller.getSnapshot();
		if (cachedView.status !== "ready")
			throw new Error("Expected ready snapshot");

		const addItem = cachedView.view.currentList.dataSource.addItem("Milk");
		freshSession.resolve(householdSessionFixture({ householdName: "Fresh" }));
		await waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { currentList: { initialState: { householdName: "Fresh" } } },
			}),
		);

		expect(cachedDataSource.close).not.toHaveBeenCalled();
		expect(cachedCoordinator.stop).not.toHaveBeenCalled();
		await expect(
			cachedView.view.currentList.dataSource.addItem("Eggs"),
		).rejects.toMatchObject({ code: "stale_current_list_resource" });
		write.resolve({
			id: "itm_new",
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		});
		await addItem;
		await activation;
		expect(events).toEqual(["write:cached", "stop:cached", "close:cached"]);
		await waitForAsync(() =>
			expect(cachedDataSource.close).toHaveBeenCalledTimes(1),
		);
	});

	it("closes a pending resource when disposed before initial List load finishes", async () => {
		const load = deferred<ActiveListInitialState>();
		const dataSource = activeListDataSourceFixture({
			load: jest.fn(() => load.promise),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await waitForAsync(() => expect(dataSource.load).toHaveBeenCalled());
		const disposal = controller.dispose();

		expect(dataSource.close).not.toHaveBeenCalled();
		load.resolve(initialListFixture());
		await Promise.all([activation, disposal]);

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("waits for an accepted Current List write before closing during disposal", async () => {
		const write = deferred<{
			id: string;
			name: string;
			checked: boolean;
			checkedByMemberName: null;
		}>();
		const dataSource = activeListDataSourceFixture({
			addItem: jest.fn(() => write.promise),
		});
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(syncCoordinatorFixture()),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		const ready = controller.getSnapshot();
		if (ready.status !== "ready") throw new Error("Expected ready snapshot");

		const addItem = ready.view.currentList.dataSource.addItem("Milk");
		const disposal = controller.dispose();

		await Promise.resolve();
		expect(dataSource.close).not.toHaveBeenCalled();
		await expect(
			ready.view.currentList.dataSource.addItem("Eggs"),
		).rejects.toMatchObject({ code: "stale_current_list_resource" });

		write.resolve({
			id: "itm_new",
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		});
		await addItem;
		await disposal;

		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("still closes the data source when sync coordinator stop rejects during disposal", async () => {
		const dataSource = activeListDataSourceFixture();
		const syncCoordinator = syncCoordinatorFixture();
		syncCoordinator.stop = jest
			.fn()
			.mockRejectedValue(new Error("stop failed"));
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		await expect(controller.dispose()).rejects.toThrow("stop failed");
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("still closes the data source when sync coordinator stop rejects after load failure", async () => {
		const dataSource = activeListDataSourceFixture({
			load: jest.fn().mockRejectedValue(new Error("load failed")),
		});
		const syncCoordinator = syncCoordinatorFixture();
		syncCoordinator.stop = jest
			.fn()
			.mockRejectedValue(new Error("stop failed"));
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({ status: "error" });
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("closes the data source when sync coordinator construction fails", async () => {
		const dataSource = activeListDataSourceFixture();
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn(() => {
				throw new Error("coordinator failed");
			}),
			logger: loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({ status: "error" });
		expect(dataSource.load).not.toHaveBeenCalled();
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("constructs the fresh Current List resource from the Household Session", async () => {
		const session = householdSessionFixture({ householdId: "hh_new" });
		const dataSource = activeListDataSourceFixture();
		const createCurrentListDataSource = jest.fn().mockReturnValue(dataSource);
		const createSyncCoordinator = jest
			.fn()
			.mockReturnValue(syncCoordinatorFixture());
		const logger = loggerFixture();
		const householdLogger = loggerFixture();
		logger.with.mockReturnValue(householdLogger);
		const controller = createActiveHouseholdController({
			householdSessionService: sessionServiceFixture({
				getHouseholdSession: jest.fn().mockResolvedValue(session),
			}),
			createCurrentListDataSource,
			createSyncCoordinator,
			logger,
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(createCurrentListDataSource).toHaveBeenCalledWith({
			household: session.activeHousehold,
			activeMember: session.activeMember,
			list: session.activeList,
			currentUser: session.user,
			members: session.members,
			database: session.householdDatabase,
		});
		expect(logger.with).toHaveBeenCalledWith({ household_id: "hh_new" });
		expect(createSyncCoordinator).toHaveBeenCalledWith({
			syncAuthorized: true,
			sync: expect.any(Function),
			logger: householdLogger,
		});
		const [{ sync }] = createSyncCoordinator.mock.calls[0];
		await sync({ mode: "full" });
		expect(dataSource.sync).toHaveBeenCalledWith({ mode: "full" });
	});
});

function collectSnapshots(controller: {
	getSnapshot: () => ActiveHouseholdSnapshot;
	subscribe: (subscriber: (snapshot: ActiveHouseholdSnapshot) => void) => {
		remove: () => void;
	};
}): ActiveHouseholdSnapshot[] {
	const snapshots = [controller.getSnapshot()];
	controller.subscribe((snapshot) => snapshots.push(snapshot));
	return snapshots;
}

function sessionServiceFixture(
	overrides: Partial<HouseholdSessionService> = {},
): HouseholdSessionService {
	const service: HouseholdSessionService = {
		getHouseholdSession: jest.fn().mockResolvedValue(householdSessionFixture()),
		saveCachedHouseholdSession: jest
			.fn()
			.mockResolvedValue(cachedHouseholdSessionFixture()),
		readCachedHouseholdSession: jest.fn().mockResolvedValue(null),
		readUnauthorizedCachedHouseholdSession: jest.fn().mockResolvedValue(null),
		discardUnauthorizedCachedHouseholdSession: jest.fn(),
		clearUnauthorizedCachedHouseholdSessionMetadata: jest
			.fn()
			.mockResolvedValue(undefined),
		clearCachedHouseholdSessionMetadata: jest.fn().mockResolvedValue(null),
		clearSignedOutHouseholdSessionData: jest.fn().mockResolvedValue(undefined),
		deleteCachedHouseholdSessionLocalData: jest
			.fn()
			.mockResolvedValue(undefined),
		...overrides,
	};
	jest
		.mocked(service.discardUnauthorizedCachedHouseholdSession)
		.mockImplementation(async (freshSession, options = {}) => {
			const cached =
				await service.readUnauthorizedCachedHouseholdSession(freshSession);
			if (!cached || options.shouldContinue?.() === false) return null;
			await options.beforeDeleteLocalData?.(cached);
			if (options.shouldContinue?.() === false) return cached;
			await service.deleteCachedHouseholdSessionLocalData(cached);
			if (options.shouldContinue?.() === false) return cached;
			await service.clearUnauthorizedCachedHouseholdSessionMetadata(
				cached,
				freshSession,
			);
			return cached;
		});

	return service;
}

function loggerFixture(): jest.Mocked<Logger> {
	const logger = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		with: jest.fn(),
	};
	logger.with.mockReturnValue(logger);
	return logger;
}

async function waitForAsync(assertion: () => void) {
	for (let attempt = 0; attempt < 25; attempt += 1) {
		try {
			assertion();
			return;
		} catch (error) {
			if (attempt === 24) throw error;
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
}

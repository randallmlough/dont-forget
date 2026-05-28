import * as h from "./active-household-controller.test-helpers";

describe("createActiveHouseholdController cache invalidation", () => {
	it("deletes unauthorized cached Household data before publishing fresh state", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.HouseholdSession>();
		const events: string[] = [];
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "New" })),
		});
		const sessionService = h.sessionServiceFixture({
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
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { currentList: { resourceKey: "current-list:1" } },
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
			view: { currentList: { resourceKey: "current-list:2" } },
		});
	});

	it("closes an unauthorized cached resource before deleting local data", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.HouseholdSession>();
		const events: string[] = [];
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "New" })),
		});
		const cachedCoordinator = h.syncCoordinatorFixture();
		cachedCoordinator.stop = jest.fn(async () => {
			events.push("stop:cached");
		});
		const sessionService = h.sessionServiceFixture({
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
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({ status: "ready" }),
		);

		freshSession.resolve(fresh);
		await Promise.resolve();
		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).not.toHaveBeenCalled();

		await activation;

		expect(cachedCoordinator.stop).toHaveBeenCalledTimes(1);
		expect(events).toEqual([
			"stop:cached",
			"close:cached",
			"delete:cached",
			"clear:cached",
		]);
	});

	it("does not delete unauthorized cached data when closing the resource fails", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.HouseholdSession>();
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				throw new Error("close failed");
			}),
		});
		const sessionService = h.sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn(() => freshSession.promise),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest.fn().mockReturnValue(cachedDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({ status: "ready" }),
		);

		freshSession.resolve(fresh);
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
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.HouseholdSession>();
		const firstCachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
		});
		const secondCachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
		});
		const sessionService = h.sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn(() => freshSession.promise),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
			deleteCachedHouseholdSessionLocalData: jest.fn(async () => {
				throw new Error("delete failed");
			}),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(firstCachedDataSource)
				.mockReturnValueOnce(secondCachedDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: false,
			signedIn: false,
		});
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { resourceKey: "current-list:1" } },
		});

		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({ status: "ready" }),
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
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "New" })),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
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
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: false,
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
			view: { currentList: { resourceKey: "current-list:2" } },
		});
	});

	it("rejects new unauthorized cached operations before local deletion starts", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const deleteCached = h.deferred<void>();
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "New" })),
		});
		const sessionService = h.sessionServiceFixture({
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
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: false,
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
		await h.waitForAsync(() =>
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
			view: { currentList: { resourceKey: "current-list:2" } },
		});
	});

	it("cancels unauthorized cached deletion when a newer activation starts", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const firstFresh = h.householdSessionFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondFresh = h.householdSessionFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const closeCached = h.deferred<void>();
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
			close: jest.fn(() => closeCached.promise),
		});
		const firstFreshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "First" })),
		});
		const secondFreshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Second" })),
		});
		const sessionService = h.sessionServiceFixture({
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
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(secondFreshDataSource)
				.mockReturnValueOnce(firstFreshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
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
		await h.waitForAsync(() =>
			expect(cachedDataSource.close).toHaveBeenCalled(),
		);

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
			view: { currentList: { resourceKey: expect.any(String) } },
		});
	});

	it("cancels unauthorized metadata clearing when a newer activation starts during deletion", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const firstFresh = h.householdSessionFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondFresh = h.householdSessionFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const deleteCached = h.deferred<void>();
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
		});
		const secondFreshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Second" })),
		});
		const sessionService = h.sessionServiceFixture({
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
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(secondFreshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
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
		await h.waitForAsync(() =>
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
			view: { currentList: { resourceKey: expect.any(String) } },
		});
	});

	it("does not resurrect unauthorized cached data when fresh opening fails", async () => {
		const cached = h.cachedHouseholdSessionFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.householdSessionFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Old" })),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest.fn().mockRejectedValue(new Error("fresh open failed")),
		});
		const sessionService = h.sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({ status: "ready" });
		expect(
			sessionService.deleteCachedHouseholdSessionLocalData,
		).toHaveBeenCalledWith(cached);
		expect(
			sessionService.clearUnauthorizedCachedHouseholdSessionMetadata,
		).toHaveBeenCalledWith(cached, fresh);
	});
});

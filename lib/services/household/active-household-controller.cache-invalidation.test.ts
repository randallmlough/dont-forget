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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(freshDataServices),
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
				view: { resourceKey: "active-household:1" },
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
			view: { resourceKey: "active-household:2" },
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(freshDataServices),
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
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
			createDataServices: jest.fn().mockReturnValue(cachedDataServices),
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
		const firstCachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const secondCachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(firstCachedDataServices)
				.mockReturnValueOnce(secondCachedDataServices),
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
			view: { resourceKey: "active-household:1" },
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(freshDataServices),
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
			cachedSnapshot.view.itemService.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Milk",
			}),
		).rejects.toMatchObject({ code: "stale_active_household_resource" });
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { resourceKey: "active-household:2" },
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(freshDataServices),
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
			cachedSnapshot.view.itemService.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Milk",
			}),
		).rejects.toMatchObject({ code: "stale_active_household_resource" });
		expect(freshDataServices.listService.getList).not.toHaveBeenCalled();

		deleteCached.resolve(undefined);
		await activation;
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { resourceKey: "active-household:2" },
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(() => closeCached.promise),
		});
		const firstFreshDataServices = h.activeHouseholdDataServicesFixture({});
		const secondFreshDataServices = h.activeHouseholdDataServicesFixture({});
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(secondFreshDataServices)
				.mockReturnValueOnce(firstFreshDataServices),
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
			expect(cachedDataServices.close).toHaveBeenCalled(),
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
			view: { resourceKey: expect.any(String) },
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const secondFreshDataServices = h.activeHouseholdDataServicesFixture({});
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
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(secondFreshDataServices),
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
			view: { resourceKey: expect.any(String) },
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
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const openFresh = new Error("fresh open failed");
		const sessionService = h.sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
			getHouseholdSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorizedCachedHouseholdSession: jest
				.fn()
				.mockResolvedValue(cached),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockImplementationOnce(() => {
					throw openFresh;
				}),
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

		expect(controller.getSnapshot()).toMatchObject({
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
});

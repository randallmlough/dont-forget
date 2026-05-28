import * as h from "./active-household-controller.test-helpers";

describe("createActiveHouseholdController resource lifecycle", () => {
	it("disposes the active resource and publishes idle", async () => {
		const dataServices = h.activeHouseholdDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await expect(controller.dispose()).resolves.toEqual({
			householdIdsForLocalDataDeletion: ["hh_avery"],
		});

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(syncCoordinator.stop).toHaveBeenCalledTimes(1);
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("publishes fresh state before retiring the previous cached resource", async () => {
		const events: string[] = [];
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(h.cachedHouseholdSessionFixture()),
			}),
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(freshDataServices),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(freshCoordinator),
			logger: h.loggerFixture(),
		});
		controller.subscribe((snapshot) => {
			if (snapshot.status === "ready") {
				events.push(`publish:${snapshot.view.resourceKey}`);
			}
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(events).toEqual([
			"publish:active-household:1",
			"publish:active-household:2",
			"close:cached",
		]);
	});

	it("publishes fresh state before waiting for cache persistence", async () => {
		const cacheSave = h.deferred<h.CachedHouseholdSession>();
		const sessionService = h.sessionServiceFixture();
		sessionService.saveCachedHouseholdSession = jest.fn(
			() => cacheSave.promise,
		);
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.activeHouseholdDataServicesFixture()),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		let activationFinished = false;
		const activation = controller
			.activate({
				getToken: async () => "token",
				authReady: true,
				signedIn: true,
			})
			.then(() => {
				activationFinished = true;
			});

		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { resourceKey: "active-household:1" },
			}),
		);
		await h.waitForAsync(() => expect(activationFinished).toBe(true));

		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledTimes(1);
		cacheSave.resolve(h.cachedHouseholdSessionFixture());
		await activation;
	});

	it("waits for in-flight cache persistence during dispose", async () => {
		const cacheSave = h.deferred<h.CachedHouseholdSession>();
		const sessionService = h.sessionServiceFixture();
		sessionService.saveCachedHouseholdSession = jest.fn(
			() => cacheSave.promise,
		);
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.activeHouseholdDataServicesFixture()),
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

		let disposed = false;
		const dispose = controller.dispose().then(() => {
			disposed = true;
		});
		await Promise.resolve();

		expect(disposed).toBe(false);

		cacheSave.resolve(h.cachedHouseholdSessionFixture());
		await dispose;

		expect(disposed).toBe(true);
	});

	it("waits for in-flight cache persistence before signed-out activation finishes", async () => {
		const cacheSave = h.deferred<h.CachedHouseholdSession>();
		const sessionService = h.sessionServiceFixture();
		sessionService.saveCachedHouseholdSession = jest.fn(
			() => cacheSave.promise,
		);
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.activeHouseholdDataServicesFixture()),
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

		let signedOutActivationFinished = false;
		const signedOutActivation = controller
			.activate({
				getToken: async () => null,
				authReady: true,
				signedIn: false,
			})
			.then(() => {
				signedOutActivationFinished = true;
			});
		await Promise.resolve();

		expect(signedOutActivationFinished).toBe(false);

		cacheSave.resolve(h.cachedHouseholdSessionFixture());
		await signedOutActivation;

		expect(signedOutActivationFinished).toBe(true);
	});

	it("persists published fresh Household Sessions before dispose finishes", async () => {
		const firstCacheSave = h.deferred<h.CachedHouseholdSession>();
		const firstSession = h.householdSessionFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondSession = h.householdSessionFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const sessionService = h.sessionServiceFixture({
			getHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(firstSession)
				.mockResolvedValueOnce(secondSession),
		});
		sessionService.saveCachedHouseholdSession = jest
			.fn()
			.mockReturnValueOnce(firstCacheSave.promise)
			.mockResolvedValue(h.cachedHouseholdSessionFixture());
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.activeHouseholdDataServicesFixture()),
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
		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		const dispose = controller.dispose();
		await Promise.resolve();

		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledTimes(1);

		firstCacheSave.resolve(h.cachedHouseholdSessionFixture());
		await dispose;

		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledTimes(2);
		expect(sessionService.saveCachedHouseholdSession).toHaveBeenLastCalledWith(
			secondSession,
		);
	});

	it("keeps the cached view published while the fresh Household Session is pending", async () => {
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture();
		const freshSession = h.deferred<h.HouseholdSession>();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(h.cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn(() => freshSession.promise),
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
		const loading = controller.getSnapshot();
		if (loading.status !== "ready") throw new Error("Expected cached ready");
		await expect(
			loading.view.itemService.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Cached eggs",
			}),
		).resolves.toBeUndefined();

		freshSession.resolve(h.householdSessionFixture({ householdName: "Fresh" }));
		await activation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { resourceKey: "active-household:2" },
		});
	});

	it("closes active resources when auth transitions to signed out", async () => {
		const dataServices = h.activeHouseholdDataServicesFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
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

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("keeps an existing cached view visible during a later signed-in replacement activation", async () => {
		const freshSession = h.deferred<h.HouseholdSession>();
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValueOnce(h.cachedHouseholdSessionFixture())
					.mockResolvedValueOnce(null),
				getHouseholdSession: jest.fn(() => freshSession.promise),
			}),
			createDataServices: jest.fn().mockReturnValue(cachedDataServices),
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
		const cached = controller.getSnapshot();
		if (cached.status !== "ready") throw new Error("Expected cached ready");

		const replacement = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "loading",
				refreshingSession: true,
				previous: {
					resourceKey: "active-household:1",
				},
			}),
		);
		const loading = controller.getSnapshot();
		if (loading.status !== "loading" || !loading.previous) {
			throw new Error("Expected loading snapshot with previous view");
		}
		await expect(
			loading.previous.itemService.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Cached eggs",
			}),
		).resolves.toBeUndefined();

		freshSession.reject(new Error("offline"));
		await replacement;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { resourceKey: "active-household:1" },
		});
	});

	it("publishes a new opaque List resource key when fresh resources replace cached resources", async () => {
		const keys: string[] = [];
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(h.cachedHouseholdSessionFixture()),
			}),
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(cachedDataServices)
				.mockReturnValueOnce(freshDataServices),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(cachedCoordinator)
				.mockReturnValueOnce(freshCoordinator),
			logger: h.loggerFixture(),
		});
		controller.subscribe((snapshot) => {
			if (snapshot.status === "ready") {
				keys.push(snapshot.view.resourceKey);
			}
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(keys).toEqual(["active-household:1", "active-household:2"]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { resourceKey: "active-household:2" },
		});
		const final = controller.getSnapshot();
		if (final.status !== "ready") throw new Error("Expected ready snapshot");
		await final.view.itemService.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Fresh milk",
		});
		expect(freshDataServices.itemService.addItem).toHaveBeenCalledWith({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Fresh milk",
		});
		expect(cachedDataServices.itemService.addItem).not.toHaveBeenCalled();
		expect(final.view.syncCoordinator).toBe(freshCoordinator);
		expect(cachedCoordinator.start).not.toHaveBeenCalled();
		expect(freshCoordinator.start).toHaveBeenCalledTimes(1);
	});

	it("waits for an accepted List write before closing a retired resource", async () => {
		const events: string[] = [];
		const write = h.deferred<{
			id: string;
			name: string;
			checked: boolean;
			checkedByMemberName: null;
		}>();
		const cachedDataServices = h.activeHouseholdDataServicesFixture({
			syncAuthorized: false,
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
		const freshDataServices = h.activeHouseholdDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		cachedCoordinator.stop = jest.fn(async () => {
			events.push("stop:cached");
		});
		const freshSession = h.deferred<h.HouseholdSession>();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(h.cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn(() => freshSession.promise),
			}),
			createDataServices: jest.fn((config) =>
				config.database.authToken ? freshDataServices : cachedDataServices,
			),
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
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { resourceKey: "active-household:1" },
			}),
		);
		const cachedView = controller.getSnapshot();
		if (cachedView.status !== "ready")
			throw new Error("Expected ready snapshot");

		const addItem = cachedView.view.itemService.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Milk",
		});
		freshSession.resolve(h.householdSessionFixture({ householdName: "Fresh" }));
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				view: { resourceKey: "active-household:2" },
			}),
		);

		expect(cachedDataServices.close).not.toHaveBeenCalled();
		expect(cachedCoordinator.stop).not.toHaveBeenCalled();
		await expect(
			cachedView.view.itemService.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Eggs",
			}),
		).rejects.toMatchObject({ code: "stale_active_household_resource" });
		write.resolve({
			id: "itm_new",
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		});
		await addItem;
		await activation;
		expect(events).toEqual(["write:cached", "stop:cached", "close:cached"]);
		await h.waitForAsync(() =>
			expect(cachedDataServices.close).toHaveBeenCalledTimes(1),
		);
	});

	it("closes the active resource when disposed after Household shell activation", async () => {
		const dataServices = h.activeHouseholdDataServicesFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
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
		await controller.dispose();

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("waits for an accepted List write before closing during disposal", async () => {
		const write = h.deferred<{
			id: string;
			name: string;
			checked: boolean;
			checkedByMemberName: null;
		}>();
		const dataServices = h.activeHouseholdDataServicesFixture({
			addItem: jest.fn(() => write.promise),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
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
		const ready = controller.getSnapshot();
		if (ready.status !== "ready") throw new Error("Expected ready snapshot");

		const addItem = ready.view.itemService.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Milk",
		});
		const disposal = controller.dispose();

		await Promise.resolve();
		expect(dataServices.close).not.toHaveBeenCalled();
		await expect(
			ready.view.itemService.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Eggs",
			}),
		).rejects.toMatchObject({ code: "stale_active_household_resource" });

		write.resolve({
			id: "itm_new",
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		});
		await addItem;
		await disposal;

		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("still closes the data source when sync coordinator stop rejects during disposal", async () => {
		const dataServices = h.activeHouseholdDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		syncCoordinator.stop = jest
			.fn()
			.mockRejectedValue(new Error("stop failed"));
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		await expect(controller.dispose()).rejects.toThrow("stop failed");
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("still closes the data source when sync coordinator stop rejects", async () => {
		const dataServices = h.activeHouseholdDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		syncCoordinator.stop = jest
			.fn()
			.mockRejectedValue(new Error("stop failed"));
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		await expect(controller.dispose()).rejects.toThrow("stop failed");
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("closes the data source when sync coordinator construction fails", async () => {
		const dataServices = h.activeHouseholdDataServicesFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn(() => {
				throw new Error("coordinator failed");
			}),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({ status: "error" });
		expect(dataServices.listService.getList).not.toHaveBeenCalled();
		expect(dataServices.itemService.listItems).not.toHaveBeenCalled();
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("constructs the fresh List resource from the Household Session", async () => {
		const session = h.householdSessionFixture({ householdId: "hh_new" });
		const dataServices = h.activeHouseholdDataServicesFixture();
		const createDataServices = jest.fn().mockReturnValue(dataServices);
		const createSyncCoordinator = jest
			.fn()
			.mockReturnValue(h.syncCoordinatorFixture());
		const logger = h.loggerFixture();
		const householdLogger = h.loggerFixture();
		logger.with.mockReturnValue(householdLogger);
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				getHouseholdSession: jest.fn().mockResolvedValue(session),
			}),
			createDataServices,
			createSyncCoordinator,
			logger,
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(createDataServices).toHaveBeenCalledWith({
			householdId: session.activeHousehold.id,
			database: session.householdDatabase,
			logger: householdLogger,
		});
		expect(logger.with).toHaveBeenCalledWith({ household_id: "hh_new" });
		expect(createSyncCoordinator).toHaveBeenCalledWith({
			syncAuthorized: true,
			sync: expect.any(Function),
			logger: householdLogger,
		});
		const [{ sync }] = createSyncCoordinator.mock.calls[0];
		await sync({ mode: "full" });
		expect(dataServices.sync).toHaveBeenCalledWith({ mode: "full" });
	});
});

import * as h from "./controller.test-helpers";

describe("createAuthenticatedAppSessionController resource lifecycle", () => {
	it("disposes the active resource and publishes idle", async () => {
		const dataServices = h.sessionDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
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
			signedOutUserId: "usr_avery",
		});

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(syncCoordinator.stop).toHaveBeenCalledTimes(1);
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("publishes fresh state before retiring the previous cached resource", async () => {
		const events: string[] = [];
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.sessionDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest.fn().mockResolvedValue(h.cachedSessionBootstrapFixture()),
			}).deps,
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
				events.push(`publish:${snapshot.session.resourceKey}`);
			}
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(events).toEqual([
			"publish:authenticated-app-session:1",
			"publish:authenticated-app-session:2",
			"close:cached",
		]);
	});

	it("publishes fresh state before waiting for cache persistence", async () => {
		const cacheSave = h.deferred<h.CachedSessionBootstrap>();
		const sessionService = h.sessionRuntimeFixture();
		sessionService.cache.save = jest.fn(() => cacheSave.promise);
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.sessionDataServicesFixture()),
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
				session: { resourceKey: "authenticated-app-session:1" },
			}),
		);
		await h.waitForAsync(() => expect(activationFinished).toBe(true));

		expect(sessionService.cache.save).toHaveBeenCalledTimes(1);
		cacheSave.resolve(h.cachedSessionBootstrapFixture());
		await activation;
	});

	it("does not publish or cache a fresh session before the HouseholdStore opens", async () => {
		const dataServicesOpened =
			h.deferred<ReturnType<typeof h.sessionDataServicesFixture>>();
		const dataServices = h.sessionDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionRuntimeFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
			createDataServices: jest.fn(() => dataServicesOpened.promise),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});
		const activation = controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toEqual({ status: "loading" }),
		);
		expect(sessionService.cache.save).not.toHaveBeenCalled();
		expect(syncCoordinator.start).not.toHaveBeenCalled();

		dataServicesOpened.resolve(dataServices);
		await activation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:1" },
		});
		expect(sessionService.cache.save).toHaveBeenCalledTimes(1);
		expect(syncCoordinator.start).toHaveBeenCalledTimes(1);
	});

	it("waits for in-flight cache persistence during dispose", async () => {
		const cacheSave = h.deferred<h.CachedSessionBootstrap>();
		const sessionService = h.sessionRuntimeFixture();
		sessionService.cache.save = jest.fn(() => cacheSave.promise);
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.sessionDataServicesFixture()),
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

		cacheSave.resolve(h.cachedSessionBootstrapFixture());
		await dispose;

		expect(disposed).toBe(true);
	});

	it("waits for in-flight cache persistence before signed-out activation finishes", async () => {
		const cacheSave = h.deferred<h.CachedSessionBootstrap>();
		const sessionService = h.sessionRuntimeFixture();
		sessionService.cache.save = jest.fn(() => cacheSave.promise);
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.sessionDataServicesFixture()),
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

		cacheSave.resolve(h.cachedSessionBootstrapFixture());
		await signedOutActivation;

		expect(signedOutActivationFinished).toBe(true);
	});

	it("persists published fresh Authenticated App Sessions before dispose finishes", async () => {
		const firstCacheSave = h.deferred<h.CachedSessionBootstrap>();
		const firstSession = h.sessionBootstrapFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondSession = h.sessionBootstrapFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const sessionService = h.sessionRuntimeFixture({
			getSession: jest
				.fn()
				.mockResolvedValueOnce(firstSession)
				.mockResolvedValueOnce(secondSession),
		});
		sessionService.cache.save = jest
			.fn()
			.mockReturnValueOnce(firstCacheSave.promise)
			.mockResolvedValue(h.cachedSessionBootstrapFixture());
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.sessionDataServicesFixture()),
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

		expect(sessionService.cache.save).toHaveBeenCalledTimes(1);

		firstCacheSave.resolve(h.cachedSessionBootstrapFixture());
		await dispose;

		expect(sessionService.cache.save).toHaveBeenCalledTimes(2);
		expect(sessionService.cache.save).toHaveBeenLastCalledWith(secondSession);
	});

	it("keeps the cached session published while the fresh Authenticated App Session is pending", async () => {
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.sessionDataServicesFixture();
		const freshSession = h.deferred<h.SessionBootstrap>();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest.fn().mockResolvedValue(h.cachedSessionBootstrapFixture()),
				getSession: jest.fn(() => freshSession.promise),
			}).deps,
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
				session: { resourceKey: "authenticated-app-session:1" },
			}),
		);
		const loading = controller.getSnapshot();
		if (loading.status !== "ready") throw new Error("Expected cached ready");
		await expect(
			loading.session.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Cached eggs",
				quantity: null,
				notes: null,
			}),
		).resolves.toBeUndefined();

		freshSession.resolve(h.sessionBootstrapFixture({ householdName: "Fresh" }));
		await activation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:2" },
		});
	});

	it("closes active resources when auth transitions to signed out", async () => {
		const dataServices = h.sessionDataServicesFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
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

	it("keeps an existing cached session visible during a later signed-in replacement activation", async () => {
		const freshSession = h.deferred<h.SessionBootstrap>();
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest
					.fn()
					.mockResolvedValueOnce(h.cachedSessionBootstrapFixture())
					.mockResolvedValueOnce(null),
				getSession: jest.fn(() => freshSession.promise),
			}).deps,
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
					resourceKey: "authenticated-app-session:1",
				},
			}),
		);
		const loading = controller.getSnapshot();
		if (loading.status !== "loading" || !loading.previous) {
			throw new Error("Expected loading snapshot with previous session");
		}
		await expect(
			loading.previous.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Cached eggs",
				quantity: null,
				notes: null,
			}),
		).resolves.toBeUndefined();

		freshSession.reject(new Error("offline"));
		await replacement;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:1" },
		});
	});

	it("publishes a new opaque List resource key when fresh resources replace cached resources", async () => {
		const keys: string[] = [];
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.sessionDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest.fn().mockResolvedValue(h.cachedSessionBootstrapFixture()),
			}).deps,
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
				keys.push(snapshot.session.resourceKey);
			}
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(keys).toEqual([
			"authenticated-app-session:1",
			"authenticated-app-session:2",
		]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:2" },
		});
		const final = controller.getSnapshot();
		if (final.status !== "ready") throw new Error("Expected ready snapshot");
		await final.session.services.items.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Fresh milk",
			quantity: null,
			notes: null,
		});
		expect(freshDataServices.items.addItem).toHaveBeenCalledWith({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Fresh milk",
			quantity: null,
			notes: null,
		});
		expect(cachedDataServices.items.addItem).not.toHaveBeenCalled();
		expect(final.session.services.sync).toEqual({
			getStatus: freshCoordinator.getStatus,
			subscribe: freshCoordinator.subscribe,
			requestSync: freshCoordinator.requestSync,
		});
		expect(final.session.services.sync).not.toHaveProperty("start");
		expect(final.session.services.sync).not.toHaveProperty("stop");
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
		const cachedDataServices = h.sessionDataServicesFixture({
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
		const freshDataServices = h.sessionDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		cachedCoordinator.stop = jest.fn(async () => {
			events.push("stop:cached");
		});
		const freshSession = h.deferred<h.SessionBootstrap>();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest.fn().mockResolvedValue(h.cachedSessionBootstrapFixture()),
				getSession: jest.fn(() => freshSession.promise),
			}).deps,
			createDataServices: jest.fn(async (config) =>
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
				session: { resourceKey: "authenticated-app-session:1" },
			}),
		);
		const cachedSnapshot = controller.getSnapshot();
		if (cachedSnapshot.status !== "ready")
			throw new Error("Expected ready snapshot");

		const addItem = cachedSnapshot.session.services.items.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Milk",
			quantity: null,
			notes: null,
		});
		freshSession.resolve(h.sessionBootstrapFixture({ householdName: "Fresh" }));
		await h.waitForAsync(() =>
			expect(controller.getSnapshot()).toMatchObject({
				status: "ready",
				session: { resourceKey: "authenticated-app-session:2" },
			}),
		);

		expect(cachedDataServices.close).not.toHaveBeenCalled();
		expect(cachedCoordinator.stop).not.toHaveBeenCalled();
		await expect(
			cachedSnapshot.session.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Eggs",
				quantity: null,
				notes: null,
			}),
		).rejects.toMatchObject({
			code: "stale_authenticated_app_session_resource",
		});
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
		const dataServices = h.sessionDataServicesFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
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
		const dataServices = h.sessionDataServicesFixture({
			addItem: jest.fn(() => write.promise),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
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

		const addItem = ready.session.services.items.addItem({
			listId: "lst_default_groceries",
			userId: "usr_avery",
			name: "Milk",
			quantity: null,
			notes: null,
		});
		const disposal = controller.dispose();

		await Promise.resolve();
		expect(dataServices.close).not.toHaveBeenCalled();
		await expect(
			ready.session.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Eggs",
				quantity: null,
				notes: null,
			}),
		).rejects.toMatchObject({
			code: "stale_authenticated_app_session_resource",
		});

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
		const dataServices = h.sessionDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		syncCoordinator.stop = jest
			.fn()
			.mockRejectedValue(new Error("stop failed"));
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		await expect(controller.dispose()).rejects.toMatchObject({
			disposal: {
				householdIdsForLocalDataDeletion: ["hh_avery"],
				signedOutUserId: "usr_avery",
			},
		});
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("still closes the data source when sync coordinator stop rejects", async () => {
		const dataServices = h.sessionDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		syncCoordinator.stop = jest
			.fn()
			.mockRejectedValue(new Error("stop failed"));
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
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
		const dataServices = h.sessionDataServicesFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture().deps,
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
		expect(dataServices.lists.getList).not.toHaveBeenCalled();
		expect(dataServices.items.listItems).not.toHaveBeenCalled();
		expect(dataServices.close).toHaveBeenCalledTimes(1);
	});

	it("constructs the fresh List resource from the Authenticated App Session", async () => {
		const session = h.sessionBootstrapFixture({ householdId: "hh_new" });
		const dataServices = h.sessionDataServicesFixture();
		const createDataServices = jest.fn().mockReturnValue(dataServices);
		const createSyncCoordinator = jest
			.fn()
			.mockReturnValue(h.syncCoordinatorFixture());
		const logger = h.loggerFixture();
		const householdLogger = h.loggerFixture();
		logger.with.mockReturnValue(householdLogger);
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				getSession: jest.fn().mockResolvedValue(session),
			}).deps,
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
			userId: session.user.id,
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

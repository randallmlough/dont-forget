import * as h from "./controller.test-helpers";

describe("createAuthenticatedAppSessionController cache invalidation", () => {
	it("deletes unauthorized cached Household data before publishing fresh state", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.SessionBootstrap>();
		const events: string[] = [];
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.sessionDataServicesFixture({});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn(() => freshSession.promise),
			readUnauthorized: jest.fn().mockResolvedValue(cached),
			deleteLocalData: jest.fn(async () => {
				events.push("delete:cached");
			}),
			clearUnauthorizedMetadata: jest.fn(async () => {
				events.push("clear:cached");
			}),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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

		freshSession.resolve(fresh);
		await activation;

		expect(events).toEqual(["close:cached", "delete:cached", "clear:cached"]);
		expect(sessionService.cache.readUnauthorized).toHaveBeenCalledWith(fresh);
		expect(sessionService.cache.deleteLocalData).toHaveBeenCalledWith(
			cached,
			fresh,
		);
		expect(sessionService.cache.clearUnauthorizedMetadata).toHaveBeenCalledWith(
			cached,
			fresh,
		);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:2" },
		});
	});

	it("replaces an associated cached Household without unauthorized local data deletion", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
			households: [
				{ id: "hh_old", name: "Old", role: "owner", isActive: false },
				{ id: "hh_new", name: "New", role: "member", isActive: true },
			],
		});
		const events: string[] = [];
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.sessionDataServicesFixture({
			close: jest.fn(async () => {
				events.push("close:fresh");
			}),
		});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorized: jest.fn().mockResolvedValue(null),
			deleteLocalData: jest.fn(async () => {
				events.push("delete:cached");
			}),
			clearUnauthorizedMetadata: jest.fn(async () => {
				events.push("clear:cached");
			}),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(sessionService.cache.readUnauthorized).toHaveBeenCalledWith(fresh);
		expect(sessionService.cache.deleteLocalData).not.toHaveBeenCalled();
		expect(
			sessionService.cache.clearUnauthorizedMetadata,
		).not.toHaveBeenCalled();
		expect(events).toEqual(["close:cached"]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: {
				resourceKey: "authenticated-app-session:2",
				activeHousehold: { id: "hh_new", name: "New" },
			},
		});
	});

	it("closes an unauthorized cached resource before deleting local data", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.SessionBootstrap>();
		const events: string[] = [];
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				events.push("close:cached");
			}),
		});
		const freshDataServices = h.sessionDataServicesFixture({});
		const cachedCoordinator = h.syncCoordinatorFixture();
		cachedCoordinator.stop = jest.fn(async () => {
			events.push("stop:cached");
		});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn(() => freshSession.promise),
			readUnauthorized: jest.fn().mockResolvedValue(cached),
			deleteLocalData: jest.fn(async () => {
				events.push("delete:cached");
			}),
			clearUnauthorizedMetadata: jest.fn(async () => {
				events.push("clear:cached");
			}),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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
		expect(sessionService.cache.deleteLocalData).not.toHaveBeenCalled();

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
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.SessionBootstrap>();
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(async () => {
				throw new Error("close failed");
			}),
		});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn(() => freshSession.promise),
			readUnauthorized: jest.fn().mockResolvedValue(cached),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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

		expect(sessionService.cache.deleteLocalData).not.toHaveBeenCalled();
		expect(
			sessionService.cache.clearUnauthorizedMetadata,
		).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toEqual({
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		});
	});

	it("publishes an error when unauthorized cached cleanup fails after cached state was published", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const freshSession = h.deferred<h.SessionBootstrap>();
		const firstCachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const secondCachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn(() => freshSession.promise),
			readUnauthorized: jest.fn().mockResolvedValue(cached),
			deleteLocalData: jest.fn(async () => {
				throw new Error("delete failed");
			}),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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
			session: { resourceKey: "authenticated-app-session:1" },
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
			sessionService.cache.clearUnauthorizedMetadata,
		).not.toHaveBeenCalled();
	});

	it("rejects new operations on an unauthorized cached resource after invalidation", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.sessionDataServicesFixture({});
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest
					.fn()
					.mockResolvedValueOnce(cached)
					.mockResolvedValueOnce(null),
				getSession: jest.fn().mockResolvedValue(fresh),
				readUnauthorized: jest.fn().mockResolvedValue(cached),
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
			cachedSnapshot.session.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Milk",
			}),
		).rejects.toMatchObject({
			code: "stale_authenticated_app_session_resource",
		});
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:2" },
		});
	});

	it("rejects new unauthorized cached operations before local deletion starts", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const deleteCached = h.deferred<void>();
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const freshDataServices = h.sessionDataServicesFixture({});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValueOnce(cached).mockResolvedValueOnce(null),
			getSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorized: jest.fn().mockResolvedValue(cached),
			deleteLocalData: jest.fn(() => deleteCached.promise),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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
			expect(sessionService.cache.deleteLocalData).toHaveBeenCalledWith(
				cached,
				fresh,
			),
		);

		await expect(
			cachedSnapshot.session.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Milk",
			}),
		).rejects.toMatchObject({
			code: "stale_authenticated_app_session_resource",
		});
		expect(freshDataServices.lists.getList).not.toHaveBeenCalled();

		deleteCached.resolve(undefined);
		await activation;
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:2" },
		});
	});

	it("cancels unauthorized cached deletion when a newer activation starts", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const firstFresh = h.sessionBootstrapFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondFresh = h.sessionBootstrapFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const closeCached = h.deferred<void>();
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			close: jest.fn(() => closeCached.promise),
		});
		const firstFreshDataServices = h.sessionDataServicesFixture({});
		const secondFreshDataServices = h.sessionDataServicesFixture({});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValueOnce(cached).mockResolvedValue(null),
			getSession: jest
				.fn()
				.mockResolvedValueOnce(firstFresh)
				.mockResolvedValueOnce(secondFresh),
			readUnauthorized: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValueOnce(null),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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

		expect(sessionService.cache.deleteLocalData).not.toHaveBeenCalled();
		expect(
			sessionService.cache.clearUnauthorizedMetadata,
		).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: expect.any(String) },
		});
	});

	it("cancels unauthorized metadata clearing when a newer activation starts during deletion", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const firstFresh = h.sessionBootstrapFixture({
			householdId: "hh_first",
			householdName: "First",
		});
		const secondFresh = h.sessionBootstrapFixture({
			householdId: "hh_second",
			householdName: "Second",
		});
		const deleteCached = h.deferred<void>();
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const secondFreshDataServices = h.sessionDataServicesFixture({});
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValueOnce(cached).mockResolvedValue(null),
			getSession: jest
				.fn()
				.mockResolvedValueOnce(firstFresh)
				.mockResolvedValueOnce(secondFresh),
			readUnauthorized: jest
				.fn()
				.mockResolvedValueOnce(cached)
				.mockResolvedValueOnce(null),
			deleteLocalData: jest.fn(() => deleteCached.promise),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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
			expect(sessionService.cache.deleteLocalData).toHaveBeenCalledWith(
				cached,
				firstFresh,
			),
		);

		const freshActivation = controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});
		deleteCached.resolve(undefined);
		await Promise.all([staleActivation, freshActivation]);

		expect(
			sessionService.cache.clearUnauthorizedMetadata,
		).not.toHaveBeenCalled();
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: expect.any(String) },
		});
	});

	it("does not resurrect unauthorized cached data when fresh opening fails", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
		});
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const openFresh = new Error("fresh open failed");
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorized: jest.fn().mockResolvedValue(cached),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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
		expect(sessionService.cache.deleteLocalData).toHaveBeenCalledWith(
			cached,
			fresh,
		);
		expect(sessionService.cache.clearUnauthorizedMetadata).toHaveBeenCalledWith(
			cached,
			fresh,
		);
	});

	it("does not fall back to the cached active Household when an associated switch reload fails", async () => {
		const cached = h.cachedSessionBootstrapFixture({
			householdId: "hh_old",
			householdName: "Old",
		});
		const fresh = h.sessionBootstrapFixture({
			householdId: "hh_new",
			householdName: "New",
			households: [
				{ id: "hh_old", name: "Old", role: "owner", isActive: false },
				{ id: "hh_new", name: "New", role: "member", isActive: true },
			],
		});
		const cachedDataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const openFresh = new Error("fresh open failed");
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
			getSession: jest.fn().mockResolvedValue(fresh),
			readUnauthorized: jest.fn().mockResolvedValue(null),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService.deps,
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

		expect(controller.getSnapshot()).toEqual({
			status: "error",
			message: "Unable to prepare your Household. Please try again.",
		});
		expect(sessionService.cache.deleteLocalData).not.toHaveBeenCalled();
		expect(
			sessionService.cache.clearUnauthorizedMetadata,
		).not.toHaveBeenCalled();
	});
});

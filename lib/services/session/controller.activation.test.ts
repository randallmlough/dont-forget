import * as h from "./controller.test-helpers";

describe("createAuthenticatedAppSessionController activation", () => {
	it("publishes a ready Authenticated App Session from a fresh Authenticated App Session", async () => {
		const dataServices = h.sessionDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture(),
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});
		const snapshots = h.collectSnapshots(controller);

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
			session: {
				resourceKey: "authenticated-app-session:1",
				services: {
					lists: expect.objectContaining({
						getList: expect.any(Function),
					}),
					items: expect.objectContaining({
						listItems: expect.any(Function),
						addItem: expect.any(Function),
						setItemChecked: expect.any(Function),
					}),
					sync: expect.objectContaining({
						getStatus: expect.any(Function),
						subscribe: expect.any(Function),
						requestSync: expect.any(Function),
					}),
				},
			},
		});
		const snapshot = controller.getSnapshot();
		if (snapshot.status !== "ready") throw new Error("Expected ready snapshot");
		expect(snapshot.session.services.sync).not.toHaveProperty("start");
		expect(snapshot.session.services.sync).not.toHaveProperty("stop");
		expect(dataServices.lists.getList).not.toHaveBeenCalled();
		expect(dataServices.items.listItems).not.toHaveBeenCalled();
		expect(syncCoordinator.start).toHaveBeenCalledTimes(1);
	});

	it("publishes loading and error snapshots when fresh activation fails", async () => {
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				getSession: jest.fn().mockRejectedValue(new Error("offline")),
			}),
			logger: h.loggerFixture(),
		});
		const snapshots = h.collectSnapshots(controller);

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

	it("publishes cached Household shell state without loading the List or starting authorized sync", async () => {
		const cached = h.cachedSessionBootstrapFixture();
		const dataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
		});
		const syncCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionRuntimeFixture({
			read: jest.fn().mockResolvedValue(cached),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService,
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => null,
			authReady: false,
			signedIn: false,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: {
				resourceKey: "authenticated-app-session:1",
				services: {
					lists: expect.objectContaining({
						getList: expect.any(Function),
					}),
					items: expect.objectContaining({
						listItems: expect.any(Function),
						addItem: expect.any(Function),
						setItemChecked: expect.any(Function),
					}),
				},
			},
		});
		expect(sessionService.getSession).not.toHaveBeenCalled();
		expect(dataServices.lists.getList).not.toHaveBeenCalled();
		expect(dataServices.items.listItems).not.toHaveBeenCalled();
		expect(syncCoordinator.start).not.toHaveBeenCalled();
	});

	it("keeps cached Household shell state when fresh loading fails", async () => {
		const dataServices = h.sessionDataServicesFixture({
			syncAuthorized: false,
			addItem: jest.fn().mockResolvedValue({
				id: "itm_cached",
				name: "Cached eggs",
				checked: false,
				checkedByMemberName: null,
			}),
		});
		const syncCoordinator = h.syncCoordinatorFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...h.sessionRuntimeFixture({
				read: jest.fn().mockResolvedValue(h.cachedSessionBootstrapFixture()),
				getSession: jest.fn().mockRejectedValue(new Error("offline")),
			}),
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});

		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: {
				resourceKey: "authenticated-app-session:1",
				services: {
					items: expect.objectContaining({
						addItem: expect.any(Function),
					}),
				},
			},
		});
		const snapshot = controller.getSnapshot();
		if (snapshot.status !== "ready") throw new Error("Expected cached ready");
		await expect(
			snapshot.session.services.items.addItem({
				listId: "lst_default_groceries",
				userId: "usr_avery",
				name: "Cached eggs",
			}),
		).resolves.toMatchObject({ name: "Cached eggs" });
		expect(syncCoordinator.start).not.toHaveBeenCalled();
		expect(syncCoordinator.stop).not.toHaveBeenCalled();
		expect(dataServices.close).not.toHaveBeenCalled();
	});

	it("does not read or publish cached Household data when signed out", async () => {
		const dataServices = h.sessionDataServicesFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionRuntimeFixture();
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService,
			createDataServices: jest.fn().mockReturnValue(dataServices),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});
		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		jest.mocked(sessionService.read).mockClear();
		jest
			.mocked(sessionService.read)
			.mockResolvedValue(h.cachedSessionBootstrapFixture());

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(sessionService.read).not.toHaveBeenCalled();
		expect(dataServices.close).toHaveBeenCalledTimes(1);
		expect(syncCoordinator.stop).toHaveBeenCalledTimes(1);
	});

	it("ignores stale activation completion without closing the newer resource or saving stale cache", async () => {
		const staleSession = h.deferred<h.SessionBootstrap>();
		const staleDataServices = h.sessionDataServicesFixture();
		const freshDataServices = h.sessionDataServicesFixture();
		const staleCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionRuntimeFixture({
			getSession: jest
				.fn()
				.mockReturnValueOnce(staleSession.promise)
				.mockResolvedValueOnce(
					h.sessionBootstrapFixture({ householdName: "Fresh" }),
				),
		});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValueOnce(staleDataServices)
				.mockReturnValueOnce(freshDataServices),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(staleCoordinator)
				.mockReturnValueOnce(freshCoordinator),
			logger: h.loggerFixture(),
		});

		const staleActivation = controller.activate({
			getToken: async () => "stale-token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() =>
			expect(sessionService.getSession).toHaveBeenCalledTimes(1),
		);
		await controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:1" },
		});
		staleSession.resolve(h.sessionBootstrapFixture({ householdName: "Stale" }));
		await staleActivation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:1" },
		});
		expect(freshCoordinator.stop).not.toHaveBeenCalled();
		expect(freshDataServices.close).not.toHaveBeenCalled();
		expect(sessionService.save).toHaveBeenCalledTimes(1);
		expect(sessionService.save).toHaveBeenCalledWith(
			expect.objectContaining({
				activeHousehold: { id: "hh_avery", name: "Fresh" },
			}),
		);
	});

	it("serializes cache writes so a stale in-flight save cannot overwrite fresh cache", async () => {
		const staleSave = h.deferred<h.CachedSessionBootstrap>();
		const savedHouseholdNames: string[] = [];
		const sessionService = h.sessionRuntimeFixture({
			getSession: jest
				.fn()
				.mockResolvedValueOnce(
					h.sessionBootstrapFixture({ householdName: "Stale" }),
				)
				.mockResolvedValueOnce(
					h.sessionBootstrapFixture({ householdName: "Fresh" }),
				),
		});
		sessionService.cache.save = sessionService.save = jest
			.fn()
			.mockImplementationOnce(async (session: h.SessionBootstrap) => {
				savedHouseholdNames.push(session.activeHousehold.name);
				return staleSave.promise;
			})
			.mockImplementationOnce(async (session: h.SessionBootstrap) => {
				savedHouseholdNames.push(session.activeHousehold.name);
				return h.cachedSessionBootstrapFixture();
			});
		const controller = h.createAuthenticatedAppSessionController({
			...sessionService,
			createDataServices: jest
				.fn()
				.mockReturnValue(h.sessionDataServicesFixture()),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValue(h.syncCoordinatorFixture()),
			logger: h.loggerFixture(),
		});

		const staleActivation = controller.activate({
			getToken: async () => "stale-token",
			authReady: true,
			signedIn: true,
		});
		await h.waitForAsync(() => expect(savedHouseholdNames).toEqual(["Stale"]));
		const freshActivation = controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});
		await Promise.resolve();
		expect(savedHouseholdNames).toEqual(["Stale"]);

		staleSave.resolve(h.cachedSessionBootstrapFixture());
		await Promise.all([staleActivation, freshActivation]);

		expect(savedHouseholdNames).toEqual(["Stale", "Fresh"]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			session: { resourceKey: "authenticated-app-session:2" },
		});
	});
});

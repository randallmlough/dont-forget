import * as h from "./active-household-controller.test-helpers";

describe("createActiveHouseholdController activation", () => {
	it("publishes a ready Active Household view from a fresh Household Session", async () => {
		const dataSource = h.activeListDataSourceFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture(),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
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
			view: {
				activeMemberName: "Avery Chen",
				currentList: {
					resourceKey: "current-list:1",
					dataSource: expect.objectContaining({
						load: expect.any(Function),
					}),
					syncCoordinator,
				},
			},
		});
		expect(dataSource.load).not.toHaveBeenCalled();
		expect(syncCoordinator.start).toHaveBeenCalledTimes(1);
	});

	it("publishes loading and error snapshots when fresh activation fails", async () => {
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				getHouseholdSession: jest.fn().mockRejectedValue(new Error("offline")),
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

	it("publishes cached Household shell state without loading the Current List or starting authorized sync", async () => {
		const cached = h.cachedHouseholdSessionFixture();
		const dataSource = h.activeListDataSourceFixture({ syncAuthorized: false });
		const syncCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionServiceFixture({
			readCachedHouseholdSession: jest.fn().mockResolvedValue(cached),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
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
			view: {
				currentList: {
					resourceKey: "current-list:1",
					dataSource: expect.objectContaining({
						load: expect.any(Function),
					}),
				},
			},
		});
		expect(sessionService.getHouseholdSession).not.toHaveBeenCalled();
		expect(dataSource.load).not.toHaveBeenCalled();
		expect(syncCoordinator.start).not.toHaveBeenCalled();
	});

	it("keeps cached Household shell state when fresh loading fails", async () => {
		const dataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			addItem: jest.fn().mockResolvedValue({
				id: "itm_cached",
				name: "Cached eggs",
				checked: false,
				checkedByMemberName: null,
			}),
		});
		const syncCoordinator = h.syncCoordinatorFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(h.cachedHouseholdSessionFixture()),
				getHouseholdSession: jest.fn().mockRejectedValue(new Error("offline")),
			}),
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
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
			view: {
				currentList: {
					resourceKey: "current-list:1",
					dataSource: expect.objectContaining({
						addItem: expect.any(Function),
					}),
				},
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

	it("does not read or publish cached Household data when signed out", async () => {
		const dataSource = h.activeListDataSourceFixture();
		const syncCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionServiceFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest.fn().mockReturnValue(dataSource),
			createSyncCoordinator: jest.fn().mockReturnValue(syncCoordinator),
			logger: h.loggerFixture(),
		});
		await controller.activate({
			getToken: async () => "token",
			authReady: true,
			signedIn: true,
		});
		jest.mocked(sessionService.readCachedHouseholdSession).mockClear();
		jest
			.mocked(sessionService.readCachedHouseholdSession)
			.mockResolvedValue(h.cachedHouseholdSessionFixture());

		await controller.activate({
			getToken: async () => null,
			authReady: true,
			signedIn: false,
		});

		expect(controller.getSnapshot()).toEqual({ status: "idle" });
		expect(sessionService.readCachedHouseholdSession).not.toHaveBeenCalled();
		expect(dataSource.close).toHaveBeenCalledTimes(1);
		expect(syncCoordinator.stop).toHaveBeenCalledTimes(1);
	});

	it("ignores stale activation completion without closing the newer resource or saving stale cache", async () => {
		const staleSession = h.deferred<h.HouseholdSession>();
		const staleDataSource = h.activeListDataSourceFixture();
		const freshDataSource = h.activeListDataSourceFixture();
		const staleCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
		const sessionService = h.sessionServiceFixture({
			getHouseholdSession: jest
				.fn()
				.mockReturnValueOnce(staleSession.promise)
				.mockResolvedValueOnce(
					h.householdSessionFixture({ householdName: "Fresh" }),
				),
		});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(staleDataSource)
				.mockReturnValueOnce(freshDataSource),
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
			expect(sessionService.getHouseholdSession).toHaveBeenCalledTimes(1),
		);
		await controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { resourceKey: "current-list:1" } },
		});
		staleSession.resolve(h.householdSessionFixture({ householdName: "Stale" }));
		await staleActivation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { resourceKey: "current-list:1" } },
		});
		expect(freshCoordinator.stop).not.toHaveBeenCalled();
		expect(freshDataSource.close).not.toHaveBeenCalled();
		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledTimes(1);
		expect(sessionService.saveCachedHouseholdSession).toHaveBeenCalledWith(
			expect.objectContaining({
				activeHousehold: { id: "hh_avery", name: "Fresh" },
			}),
		);
	});

	it("serializes cache writes so a stale in-flight save cannot overwrite fresh cache", async () => {
		const staleSave = h.deferred<h.CachedHouseholdSession>();
		const savedHouseholdNames: string[] = [];
		const sessionService = h.sessionServiceFixture({
			getHouseholdSession: jest
				.fn()
				.mockResolvedValueOnce(
					h.householdSessionFixture({ householdName: "Stale" }),
				)
				.mockResolvedValueOnce(
					h.householdSessionFixture({ householdName: "Fresh" }),
				),
		});
		sessionService.saveCachedHouseholdSession = jest
			.fn()
			.mockImplementationOnce(async (session: h.HouseholdSession) => {
				savedHouseholdNames.push(session.activeHousehold.name);
				return staleSave.promise;
			})
			.mockImplementationOnce(async (session: h.HouseholdSession) => {
				savedHouseholdNames.push(session.activeHousehold.name);
				return h.cachedHouseholdSessionFixture();
			});
		const controller = h.createActiveHouseholdController({
			householdSessionService: sessionService,
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValue(h.activeListDataSourceFixture()),
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

		staleSave.resolve(h.cachedHouseholdSessionFixture());
		await Promise.all([staleActivation, freshActivation]);

		expect(savedHouseholdNames).toEqual(["Stale", "Fresh"]);
		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { resourceKey: "current-list:2" } },
		});
	});
});

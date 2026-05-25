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

	it("publishes cached Current List state without starting authorized sync", async () => {
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
				currentList: { initialState: { householdName: "Avery" } },
			},
		});
		expect(sessionService.getHouseholdSession).not.toHaveBeenCalled();
		expect(syncCoordinator.start).not.toHaveBeenCalled();
	});

	it("publishes an error when cached Current List loading fails and fresh is unavailable", async () => {
		const dataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest.fn().mockRejectedValue(new Error("cached load failed")),
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

		expect(controller.getSnapshot()).toMatchObject({ status: "error" });
		expect(syncCoordinator.start).not.toHaveBeenCalled();
		expect(dataSource.close).toHaveBeenCalledTimes(1);
	});

	it("keeps cached Current List state when fresh loading fails", async () => {
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
		const cachedLoad = h.deferred<h.ActiveListInitialState>();
		const cachedDataSource = h.activeListDataSourceFixture({
			syncAuthorized: false,
			load: jest.fn(() => cachedLoad.promise),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(h.initialListFixture({ householdName: "Fresh" })),
		});
		const freshCoordinator = h.syncCoordinatorFixture();
		const controller = h.createActiveHouseholdController({
			householdSessionService: h.sessionServiceFixture({
				readCachedHouseholdSession: jest
					.fn()
					.mockResolvedValue(h.cachedHouseholdSessionFixture()),
				getHouseholdSession: jest
					.fn()
					.mockResolvedValue(
						h.householdSessionFixture({ householdName: "Fresh" }),
					),
			}),
			createCurrentListDataSource: jest
				.fn()
				.mockReturnValueOnce(cachedDataSource)
				.mockReturnValueOnce(freshDataSource),
			createSyncCoordinator: jest
				.fn()
				.mockReturnValueOnce(h.syncCoordinatorFixture())
				.mockReturnValueOnce(freshCoordinator),
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
				view: { currentList: { initialState: { householdName: "Fresh" } } },
			}),
		);

		cachedLoad.resolve(h.initialListFixture({ householdName: "Cached" }));
		await activation;

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Fresh" } } },
		});
		expect(freshCoordinator.stop).not.toHaveBeenCalled();
		expect(freshDataSource.close).not.toHaveBeenCalled();
		await h.waitForAsync(() =>
			expect(cachedDataSource.close).toHaveBeenCalledTimes(1),
		);
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
		const staleLoad = h.deferred<h.ActiveListInitialState>();
		const staleDataSource = h.activeListDataSourceFixture({
			load: jest.fn(() => staleLoad.promise),
		});
		const freshDataSource = h.activeListDataSourceFixture({
			load: jest
				.fn()
				.mockResolvedValue(
					h.initialListFixture({ householdName: "Fresh", itemName: "Eggs" }),
				),
		});
		const staleCoordinator = h.syncCoordinatorFixture();
		const freshCoordinator = h.syncCoordinatorFixture();
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
		await h.waitForAsync(() => expect(staleDataSource.load).toHaveBeenCalled());
		await controller.activate({
			getToken: async () => "fresh-token",
			authReady: true,
			signedIn: true,
		});

		expect(controller.getSnapshot()).toMatchObject({
			status: "ready",
			view: { currentList: { initialState: { householdName: "Fresh" } } },
		});
		staleLoad.resolve(h.initialListFixture({ householdName: "Stale" }));
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
			view: { currentList: { initialState: { householdName: "Avery" } } },
		});
	});
});

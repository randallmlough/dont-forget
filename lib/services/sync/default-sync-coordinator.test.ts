import { createMockLogger } from "@/lib/test/mocks/logger";

const mockGetDefaultSyncAppStateAdapter = jest.fn();
const mockGetDefaultSyncNetworkStatusAdapter = jest.fn();
const mockCreateSyncCoordinator = jest.fn();

jest.mock("./app-state", () => ({
	getDefaultSyncAppStateAdapter: mockGetDefaultSyncAppStateAdapter,
}));

jest.mock("./network-status", () => ({
	getDefaultSyncNetworkStatusAdapter: mockGetDefaultSyncNetworkStatusAdapter,
}));

jest.mock("./sync-coordinator", () => ({
	createSyncCoordinator: mockCreateSyncCoordinator,
}));

describe("createDefaultSyncCoordinator", () => {
	beforeEach(() => {
		mockGetDefaultSyncAppStateAdapter.mockReset();
		mockGetDefaultSyncNetworkStatusAdapter.mockReset();
		mockCreateSyncCoordinator.mockReset();
		mockGetDefaultSyncAppStateAdapter.mockReturnValue({
			getCurrentState: () => "active",
			subscribe: () => ({ remove() {} }),
		});
		mockGetDefaultSyncNetworkStatusAdapter.mockReturnValue({
			getCurrentStatus: () => "online",
			refreshCurrentStatus: async () => "online",
			subscribe: () => ({ remove() {} }),
		});
		mockCreateSyncCoordinator.mockReturnValue({
			getStatus: () => "synced",
			requestSync: jest.fn(),
			start: jest.fn(),
			stop: jest.fn(),
			subscribe: jest.fn(),
		});
	});

	it("uses app-wide platform adapters for authorized Household sync", () => {
		const deps = coordinatorDeps({ syncAuthorized: true });
		const { createDefaultSyncCoordinator } = loadDefaultSyncCoordinatorModule();

		createDefaultSyncCoordinator(deps);

		expect(mockGetDefaultSyncAppStateAdapter).toHaveBeenCalledTimes(1);
		expect(mockGetDefaultSyncNetworkStatusAdapter).toHaveBeenCalledTimes(1);
		expect(mockCreateSyncCoordinator).toHaveBeenCalledWith({
			...deps,
			appState: mockGetDefaultSyncAppStateAdapter.mock.results[0]?.value,
			networkStatus:
				mockGetDefaultSyncNetworkStatusAdapter.mock.results[0]?.value,
		});
	});

	it("does not create the app-wide network adapter for unauthorized Household sync", () => {
		const deps = coordinatorDeps({ syncAuthorized: false });
		const { createDefaultSyncCoordinator } = loadDefaultSyncCoordinatorModule();

		createDefaultSyncCoordinator(deps);

		expect(mockGetDefaultSyncAppStateAdapter).toHaveBeenCalledTimes(1);
		expect(mockGetDefaultSyncNetworkStatusAdapter).not.toHaveBeenCalled();
		expect(mockCreateSyncCoordinator).toHaveBeenCalledWith({
			...deps,
			appState: mockGetDefaultSyncAppStateAdapter.mock.results[0]?.value,
			networkStatus: {
				getCurrentStatus: expect.any(Function),
				refreshCurrentStatus: expect.any(Function),
				subscribe: expect.any(Function),
			},
		});
	});
});

function coordinatorDeps(overrides: { syncAuthorized: boolean }) {
	return {
		syncAuthorized: overrides.syncAuthorized,
		sync: jest.fn(async () => ({ changed: false })),
		logger: createMockLogger(),
	};
}

function loadDefaultSyncCoordinatorModule(): typeof import("./default-sync-coordinator") {
	let moduleExports: typeof import("./default-sync-coordinator") | null = null;
	jest.isolateModules(() => {
		moduleExports = jest.requireActual<
			typeof import("./default-sync-coordinator")
		>("./default-sync-coordinator");
	});
	if (!moduleExports) {
		throw new Error("Unable to load default sync coordinator module");
	}
	return moduleExports;
}

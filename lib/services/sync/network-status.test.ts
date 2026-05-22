const mockNetInfoRemove = jest.fn();
const mockAddEventListener = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
	__esModule: true,
	default: {
		addEventListener: mockAddEventListener,
		refresh: mockRefresh,
	},
}));

describe("getDefaultSyncNetworkStatusAdapter", () => {
	beforeEach(() => {
		jest.resetModules();
		mockNetInfoRemove.mockClear();
		mockAddEventListener.mockReset();
		mockRefresh.mockReset();
		mockAddEventListener.mockReturnValue(mockNetInfoRemove);
	});

	it("starts with unknown network status", () => {
		const { getDefaultSyncNetworkStatusAdapter } = loadNetworkStatusModule();

		const adapter = getDefaultSyncNetworkStatusAdapter();

		expect(adapter.getCurrentStatus()).toBe("unknown");
	});

	it("maps NetInfo connectivity into app sync network status", () => {
		let netInfoListener: NetInfoListener | null = null;
		mockAddEventListener.mockImplementation((listener: NetInfoListener) => {
			netInfoListener = listener;
			return mockNetInfoRemove;
		});
		const { getDefaultSyncNetworkStatusAdapter } = loadNetworkStatusModule();
		const adapter = getDefaultSyncNetworkStatusAdapter();

		emitNetInfoState(netInfoListener, {
			isConnected: true,
			isInternetReachable: true,
		});
		expect(adapter.getCurrentStatus()).toBe("online");

		emitNetInfoState(netInfoListener, {
			isConnected: true,
			isInternetReachable: false,
		});
		expect(adapter.getCurrentStatus()).toBe("offline");

		emitNetInfoState(netInfoListener, {
			isConnected: false,
			isInternetReachable: true,
		});
		expect(adapter.getCurrentStatus()).toBe("offline");

		emitNetInfoState(netInfoListener, {
			isConnected: true,
			isInternetReachable: null,
		});
		expect(adapter.getCurrentStatus()).toBe("online");

		emitNetInfoState(netInfoListener, {
			isConnected: null,
			isInternetReachable: null,
		});
		expect(adapter.getCurrentStatus()).toBe("unknown");
	});

	it("notifies subscribers and removes listeners", () => {
		let netInfoListener: NetInfoListener | null = null;
		mockAddEventListener.mockImplementation((listener: NetInfoListener) => {
			netInfoListener = listener;
			return mockNetInfoRemove;
		});
		const { getDefaultSyncNetworkStatusAdapter } = loadNetworkStatusModule();
		const adapter = getDefaultSyncNetworkStatusAdapter();
		const firstListener = jest.fn();
		const secondListener = jest.fn();

		adapter.subscribe(firstListener);
		const secondSubscription = adapter.subscribe(secondListener);
		emitNetInfoState(netInfoListener, {
			isConnected: true,
			isInternetReachable: true,
		});
		secondSubscription.remove();
		emitNetInfoState(netInfoListener, {
			isConnected: false,
			isInternetReachable: null,
		});

		expect(firstListener).toHaveBeenCalledTimes(2);
		expect(firstListener).toHaveBeenNthCalledWith(1, "online");
		expect(firstListener).toHaveBeenNthCalledWith(2, "offline");
		expect(secondListener).toHaveBeenCalledTimes(1);
		expect(secondListener).toHaveBeenCalledWith("online");
	});

	it("refreshes the cached network status through NetInfo", async () => {
		const { getDefaultSyncNetworkStatusAdapter } = loadNetworkStatusModule();
		const adapter = getDefaultSyncNetworkStatusAdapter();
		mockRefresh.mockResolvedValue({
			isConnected: true,
			isInternetReachable: true,
		});

		await expect(adapter.refreshCurrentStatus()).resolves.toBe("online");

		expect(mockRefresh).toHaveBeenCalledTimes(1);
		expect(adapter.getCurrentStatus()).toBe("online");
	});

	it("creates a lazy singleton backed by one NetInfo subscription", () => {
		const { getDefaultSyncNetworkStatusAdapter } = loadNetworkStatusModule();

		const firstAdapter = getDefaultSyncNetworkStatusAdapter();
		const secondAdapter = getDefaultSyncNetworkStatusAdapter();

		expect(firstAdapter).toBe(secondAdapter);
		expect(mockAddEventListener).toHaveBeenCalledTimes(1);
	});
});

type NetInfoListener = (state: {
	isConnected: boolean | null;
	isInternetReachable: boolean | null;
}) => void;

function emitNetInfoState(
	listener: NetInfoListener | null,
	state: Parameters<NetInfoListener>[0],
) {
	if (!listener) {
		throw new Error("NetInfo listener was not registered");
	}
	listener(state);
}

function loadNetworkStatusModule(): typeof import("./network-status") {
	let moduleExports: typeof import("./network-status") | null = null;
	jest.isolateModules(() => {
		moduleExports =
			jest.requireActual<typeof import("./network-status")>("./network-status");
	});
	if (!moduleExports) {
		throw new Error("Unable to load network status module");
	}
	return moduleExports;
}

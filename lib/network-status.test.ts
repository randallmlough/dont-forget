import {
	createNetInfoNetworkStatusAdapter,
	type NetworkStatus,
	networkStatusFromNetInfoState,
} from "@/lib/network-status";

describe("networkStatusFromNetInfoState", () => {
	it("maps explicit offline connectivity", () => {
		expect(
			networkStatusFromNetInfoState({
				isConnected: false,
				isInternetReachable: null,
			}),
		).toEqual({ connectivity: "offline" });
		expect(
			networkStatusFromNetInfoState({
				isConnected: true,
				isInternetReachable: false,
			}),
		).toEqual({ connectivity: "offline" });
	});

	it("maps strict internet reachability to online", () => {
		expect(
			networkStatusFromNetInfoState({
				isConnected: true,
				isInternetReachable: true,
			}),
		).toEqual({ connectivity: "online" });
	});

	it("keeps ambiguous platform state unknown", () => {
		expect(
			networkStatusFromNetInfoState({
				isConnected: true,
				isInternetReachable: null,
			}),
		).toEqual({ connectivity: "unknown" });
		expect(
			networkStatusFromNetInfoState({
				isConnected: null,
				isInternetReachable: null,
			}),
		).toEqual({ connectivity: "unknown" });
	});
});

describe("createNetInfoNetworkStatusAdapter", () => {
	it("fetches current connectivity through the app-owned status shape", async () => {
		const adapter = createNetInfoNetworkStatusAdapter({
			fetch: jest.fn(async () => ({
				isConnected: true,
				isInternetReachable: true,
			})),
			addEventListener: jest.fn(() => jest.fn()),
		});

		await expect(adapter.getCurrentStatus()).resolves.toEqual({
			connectivity: "online",
		});
	});

	it("subscribes to connectivity changes through the app-owned status shape", () => {
		const emitRef: {
			current:
				| ((state: {
						isConnected: boolean | null;
						isInternetReachable: boolean | null;
				  }) => void)
				| null;
		} = { current: null };
		const unsubscribe = jest.fn();
		const listener = jest.fn<void, [NetworkStatus]>();
		const adapter = createNetInfoNetworkStatusAdapter({
			fetch: jest.fn(async () => ({
				isConnected: null,
				isInternetReachable: null,
			})),
			addEventListener: jest.fn((nextListener) => {
				emitRef.current = nextListener;
				return unsubscribe;
			}),
		});

		const subscription = adapter.subscribe(listener);
		if (!emitRef.current) {
			throw new Error("Expected network listener to be registered");
		}
		emitRef.current({ isConnected: false, isInternetReachable: null });

		expect(listener).toHaveBeenCalledWith({ connectivity: "offline" });
		subscription.remove();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});
});

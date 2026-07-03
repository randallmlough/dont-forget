import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { useLogger } from "@/client/lib/logger";
import { type Deferred, deferred } from "@/test/async";
import { createMockLogger, type MockLogger } from "@/test/mocks/logger";
import { appProductDatabase } from "./powersync-app-database";
import { useWatchedResource } from "./use-watched-resource";

const mockChangeListeners = new Set<() => void>();

jest.mock("./powersync-app-database", () => ({
	appProductDatabase: {
		subscribeChanges: jest.fn(),
	},
}));

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>("@/test/mocks/logger")
		.createMockLoggerModule(),
);

let mockLogger: MockLogger;

describe("useWatchedResource", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockChangeListeners.clear();
		mockSubscribeChanges().mockImplementation((listener: () => void) => {
			mockChangeListeners.add(listener);
			return {
				remove() {
					mockChangeListeners.delete(listener);
				},
			};
		});
		mockLogger = createMockLogger();
		mockLogger.with.mockReturnValue(mockLogger);
		jest.mocked(useLogger).mockReturnValue(mockLogger);
	});

	it("loads on mount and resets to loading when the key changes", async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const view = await render(<ResourceView loadKey="first" load={load} />);

		expect(screen.getByText("loading")).toBeTruthy();
		await resolveLoad(first, "Milk");
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await view.rerender(<ResourceView loadKey="second" load={load} />);

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("Milk")).toBeNull();
		await resolveLoad(second, "Eggs");
		await waitFor(() => expect(screen.getByText("Eggs")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("reruns from an error state when the product change signal fires", async () => {
		const load = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce("Milk");
		await render(<ResourceView loadKey="list" load={load} />);

		await waitFor(() =>
			expect(screen.getByText("Unable to load")).toBeTruthy(),
		);

		await fireChange();

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("keeps ready data rendered while a signaled reload is pending", async () => {
		const reload = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockReturnValueOnce(reload.promise);
		await render(<ResourceView loadKey="list" load={load} />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		await fireChange();

		expect(screen.getByText("Milk")).toBeTruthy();
		await resolveLoad(reload, "Eggs");
		await waitFor(() => expect(screen.getByText("Eggs")).toBeTruthy());
	});

	it("discards stale results after the key changes", async () => {
		const stale = deferred<string>();
		const fresh = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockReturnValueOnce(stale.promise)
			.mockReturnValueOnce(fresh.promise);
		const view = await render(<ResourceView loadKey="stale" load={load} />);

		await view.rerender(<ResourceView loadKey="fresh" load={load} />);
		await resolveLoad(stale, "Stale");
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		await resolveLoad(fresh, "Fresh");

		await waitFor(() => expect(screen.getByText("Fresh")).toBeTruthy());
		expect(screen.queryByText("Stale")).toBeNull();
	});

	it("ignores an older same-key refetch result when a newer change-signal load wins", async () => {
		const older = deferred<string>();
		const latest = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockReturnValueOnce(older.promise)
			.mockReturnValueOnce(latest.promise);
		await render(<ResourceView loadKey="list" load={load} />);
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
		await fireChange();
		await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
		await resolveLoad(latest, "Latest");
		await waitFor(() => expect(screen.getByText("Latest")).toBeTruthy());
		await resolveLoad(older, "Older");

		expect(screen.getByText("Latest")).toBeTruthy();
		expect(screen.queryByText("Older")).toBeNull();
	});

	it("keeps ready data and logs when a background rerun fails", async () => {
		const error = new Error("offline");
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockRejectedValueOnce(error);
		await render(<ResourceView loadKey="list" load={load} />);
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await fireChange();

		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"watched resource background load failed",
				{ error },
			),
		);
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.queryByText("Unable to load")).toBeNull();
	});

	it("reload resets ready data and surfaces failures", async () => {
		const reload = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockReturnValueOnce(reload.promise);
		await render(<ResourceView loadKey="list" load={load} />);
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await fireEvent.press(screen.getByRole("button", { name: "Reload" }));

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("Milk")).toBeNull();
		await rejectLoad(reload, new Error("offline"));

		await waitFor(() =>
			expect(screen.getByText("Unable to load")).toBeTruthy(),
		);
		expect(mockLogger.error).not.toHaveBeenCalled();
	});

	it("removes the subscription and discards in-flight results on unmount", async () => {
		const pending = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockReturnValue(pending.promise);
		const view = await render(<ResourceView loadKey="list" load={load} />);

		await waitFor(() => expect(mockChangeListeners.size).toBe(1));
		view.unmount();
		await waitFor(() => expect(mockChangeListeners.size).toBe(0));
		await resolveLoad(pending, "Milk");

		expect(screen.queryByText("Milk")).toBeNull();
	});

	it("refetch reruns the load from any state", async () => {
		const load = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce("Milk");
		await render(<ResourceView loadKey="list" load={load} />);
		await waitFor(() =>
			expect(screen.getByText("Unable to load")).toBeTruthy(),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("does not subscribe to product changes when watching is disabled", async () => {
		const load = jest.fn<Promise<string>, []>().mockResolvedValue("Milk");
		await render(<ResourceView loadKey="list" load={load} watch={false} />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		expect(mockSubscribeChanges()).not.toHaveBeenCalled();
	});
});

function mockSubscribeChanges() {
	return jest.mocked(appProductDatabase.subscribeChanges);
}

function ResourceView({
	loadKey,
	load,
	watch,
}: {
	loadKey: string;
	load: () => Promise<string>;
	watch?: boolean;
}) {
	const { state, refetch, reload } = useWatchedResource({
		key: loadKey,
		load,
		errorMessage: "Unable to load",
		watch,
	});

	return (
		<>
			<Text>{state.status === "ready" ? state.data : state.status}</Text>
			{state.status === "error" ? <Text>{state.message}</Text> : null}
			<Pressable accessibilityRole="button" onPress={refetch}>
				<Text>Retry</Text>
			</Pressable>
			<Pressable accessibilityRole="button" onPress={reload}>
				<Text>Reload</Text>
			</Pressable>
		</>
	);
}

async function fireChange() {
	await act(async () => {
		for (const listener of mockChangeListeners) {
			listener();
		}
	});
}

async function resolveLoad<T>(load: Deferred<T>, value: T) {
	await act(async () => {
		load.resolve(value);
		await load.promise;
	});
}

async function rejectLoad<T>(load: Deferred<T>, error: unknown) {
	await act(async () => {
		load.reject(error);
		await load.promise.catch(() => undefined);
	});
}

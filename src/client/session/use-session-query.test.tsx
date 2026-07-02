import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { useLogger } from "@/client/lib/logger";
import type { AuthenticatedAppSession } from "@/client/session";
import { type Deferred, deferred } from "@/test/async";
import { createMockLogger, type MockLogger } from "@/test/mocks/logger";
import { useSessionQuery } from "./use-session-query";

let mockLogger: MockLogger;

jest.mock("@/client/lib/logger", () =>
	jest
		.requireActual<typeof import("@/test/mocks/logger")>(
			"@/test/mocks/logger",
		)
		.createMockLoggerModule(),
);

describe("useSessionQuery", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLogger = createMockLogger();
		mockLogger.with.mockReturnValue(mockLogger);
		jest.mocked(useLogger).mockReturnValue(mockLogger);
	});

	it("loads on mount and resets to loading when the load key changes", async () => {
		const session = sessionFixture();
		const first = deferred<string>();
		const second = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const view = await render(
			<QueryView session={session} loadKey="first" load={load} />,
		);

		expect(screen.getByText("loading")).toBeTruthy();
		await resolveLoad(first, "Milk");
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await view.rerender(
			<QueryView session={session} loadKey="second" load={load} />,
		);

		await waitFor(() => expect(screen.getByText("loading")).toBeTruthy());
		expect(screen.queryByText("Milk")).toBeNull();
		await resolveLoad(second, "Eggs");
		await waitFor(() => expect(screen.getByText("Eggs")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("reruns from an error state when the change signal fires", async () => {
		const session = sessionFixture();
		const load = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce("Milk");
		await render(<QueryView session={session} loadKey="list" load={load} />);

		await waitFor(() =>
			expect(screen.getByText("Unable to load")).toBeTruthy(),
		);

		await act(async () => {
			session.fireChange();
		});

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("keeps ready data rendered while a signaled reload is pending", async () => {
		const session = sessionFixture();
		const reload = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockReturnValueOnce(reload.promise);
		await render(<QueryView session={session} loadKey="list" load={load} />);

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		await act(async () => {
			session.fireChange();
		});

		expect(screen.getByText("Milk")).toBeTruthy();
		await resolveLoad(reload, "Eggs");
		await waitFor(() => expect(screen.getByText("Eggs")).toBeTruthy());
	});

	it("discards stale results after the load key changes", async () => {
		const session = sessionFixture();
		const stale = deferred<string>();
		const fresh = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockReturnValueOnce(stale.promise)
			.mockReturnValueOnce(fresh.promise);
		const view = await render(
			<QueryView session={session} loadKey="stale" load={load} />,
		);

		await view.rerender(
			<QueryView session={session} loadKey="fresh" load={load} />,
		);
		await resolveLoad(stale, "Stale");
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		await resolveLoad(fresh, "Fresh");

		await waitFor(() => expect(screen.getByText("Fresh")).toBeTruthy());
		expect(screen.queryByText("Stale")).toBeNull();
	});

	it("coalesces signals during an in-flight load into one trailing rerun", async () => {
		const session = sessionFixture();
		const firstReload = deferred<string>();
		const trailingReload = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockReturnValueOnce(firstReload.promise)
			.mockReturnValueOnce(trailingReload.promise);
		await render(<QueryView session={session} loadKey="list" load={load} />);
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await act(async () => {
			session.fireChange();
			session.fireChange();
			session.fireChange();
		});
		expect(load).toHaveBeenCalledTimes(2);

		await resolveLoad(firstReload, "Ignored");
		await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
		expect(screen.getByText("Milk")).toBeTruthy();
		await resolveLoad(trailingReload, "Eggs");

		await waitFor(() => expect(screen.getByText("Eggs")).toBeTruthy());
		expect(screen.queryByText("Ignored")).toBeNull();
	});

	it("keeps ready data and logs when a background rerun fails", async () => {
		const session = sessionFixture();
		const error = new Error("offline");
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockRejectedValueOnce(error);
		await render(<QueryView session={session} loadKey="list" load={load} />);
		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());

		await act(async () => {
			session.fireChange();
		});

		await waitFor(() =>
			expect(mockLogger.error).toHaveBeenCalledWith(
				"session query background load failed",
				{ error },
			),
		);
		expect(screen.getByText("Milk")).toBeTruthy();
		expect(screen.queryByText("Unable to load")).toBeNull();
	});

	it("reload resets ready data and surfaces failures", async () => {
		const session = sessionFixture();
		const reload = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockResolvedValueOnce("Milk")
			.mockReturnValueOnce(reload.promise);
		await render(<QueryView session={session} loadKey="list" load={load} />);
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
		const session = sessionFixture();
		const pending = deferred<string>();
		const load = jest
			.fn<Promise<string>, []>()
			.mockReturnValue(pending.promise);
		const view = await render(
			<QueryView session={session} loadKey="list" load={load} />,
		);

		await waitFor(() => expect(session.listenerCount()).toBe(1));
		view.unmount();
		await waitFor(() => expect(session.listenerCount()).toBe(0));
		await resolveLoad(pending, "Milk");

		expect(screen.queryByText("Milk")).toBeNull();
	});

	it("refetch reruns the load from any state", async () => {
		const session = sessionFixture();
		const load = jest
			.fn<Promise<string>, []>()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce("Milk");
		await render(<QueryView session={session} loadKey="list" load={load} />);
		await waitFor(() =>
			expect(screen.getByText("Unable to load")).toBeTruthy(),
		);

		await fireEvent.press(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(screen.getByText("Milk")).toBeTruthy());
		expect(load).toHaveBeenCalledTimes(2);
	});
});

function QueryView({
	session,
	loadKey,
	load,
}: {
	session: AuthenticatedAppSession;
	loadKey: string;
	load: () => Promise<string>;
}) {
	const { state, refetch, reload } = useSessionQuery({
		session,
		loadKey,
		load,
		errorMessage: "Unable to load",
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

function sessionFixture(): AuthenticatedAppSession & {
	fireChange: () => void;
	listenerCount: () => number;
} {
	const listeners = new Set<() => void>();
	return {
		user: {
			id: "usr_avery",
			email: "avery@example.com",
			displayName: "Avery Chen",
			firstName: "Avery",
			lastName: "Chen",
		},
		activeHousehold: { id: "hh_avery", name: "Avery" },
		households: [
			{ id: "hh_avery", name: "Avery", role: "owner", isActive: true },
		],
		activeMember: {
			id: "mbr_avery",
			userId: "usr_avery",
			role: "owner",
			displayName: "Avery Chen",
		},
		members: [
			{
				membershipId: "mbr_avery",
				userId: "usr_avery",
				role: "owner",
				displayName: "Avery Chen",
			},
		],
		resourceKey: "authenticated-app-session:1",
		services: {
			lists: {
				createList: unusedSessionService,
				getList: unusedSessionService,
				renameList: unusedSessionService,
				deleteList: unusedSessionService,
				listLists: unusedSessionService,
			},
			items: {
				listItems: unusedSessionService,
				addItem: unusedSessionService,
				setItemChecked: unusedSessionService,
			},
			changes: {
				subscribe(listener) {
					listeners.add(listener);
					return {
						remove() {
							listeners.delete(listener);
						},
					};
				},
			},
			sync: {
				getStatus: () => "synced",
				subscribe: () => ({ remove() {} }),
			},
		},
		fireChange() {
			for (const listener of listeners) {
				listener();
			}
		},
		listenerCount() {
			return listeners.size;
		},
	};
}

async function unusedSessionService(): Promise<never> {
	throw new Error("useSessionQuery tests must not call session data services");
}

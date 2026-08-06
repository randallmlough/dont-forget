import { useAuth } from "@clerk/clerk-expo";
import type {
	HouseholdApiClient,
	HouseholdJoinCode,
	InvitationRecord,
} from "@mobile/features/household/api";
import type { AuthenticatedAppSession } from "@mobile/session";
import type {
	UploadQueueMonitor,
	UploadQueueState,
	UploadQueueStats,
} from "@mobile/session/upload-queue";
import { deferred } from "@mobile/test/async";
import { drainToasts, ToastHarness } from "@mobile/test/toast";
import {
	act,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react-native";
import { useHouseholdSettings } from "./use-household-settings";

jest.mock("@clerk/clerk-expo", () => ({
	useAuth: jest.fn(),
}));

jest.mock("expo-clipboard", () => ({
	setStringAsync: jest.fn(async () => undefined),
}));

describe("useHouseholdSettings operation reporting", () => {
	beforeEach(() => {
		jest.mocked(useAuth).mockReturnValue({
			getToken: jest.fn(async () => "session-token"),
		} as unknown as ReturnType<typeof useAuth>);
	});

	afterEach(drainToasts);

	it("reports a failed rename and frees the Household for another attempt", async () => {
		const client = householdClientFixture();
		client.renameHousehold = jest.fn(async () => {
			throw new Error("Household name already taken.");
		});
		const { result } = await renderUseHouseholdSettings({ client });

		await act(async () => {
			await result.current.actions.renameHousehold("Wilson House");
		});

		expect(
			await screen.findByText("Household name already taken."),
		).toBeTruthy();
		expect(result.current.state).toMatchObject({
			status: "ready",
			operation: { status: "idle" },
		});
	});

	it("reports a renamed Household", async () => {
		const { result } = await renderUseHouseholdSettings();

		await act(async () => {
			await result.current.actions.renameHousehold("Wilson House");
		});

		expect(await screen.findByText("Household renamed.")).toBeTruthy();
	});
});

describe("useHouseholdSettings leaveHousehold", () => {
	beforeEach(() => {
		jest.useRealTimers();
		jest.mocked(useAuth).mockReturnValue({
			getToken: jest.fn(async () => "session-token"),
		} as unknown as ReturnType<typeof useAuth>);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("leaves immediately when the upload queue is already empty", async () => {
		const { result, client, reloadSession, uploadQueue } =
			await renderUseHouseholdSettings();
		const confirmDiscardUnsyncedChanges = jest.fn(async () => true);

		await act(async () => {
			await result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
		});

		expect(client.leaveHousehold).toHaveBeenCalledWith("hh_1");
		expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" });
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});

	it("waits for a pending upload queue to drain before leaving", async () => {
		const uploadQueue = uploadQueueFixture({ count: 2, connected: true });
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => true);

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1));

		expect(client.leaveHousehold).not.toHaveBeenCalled();

		await act(async () => {
			uploadQueue.setCount(0);
			uploadQueue.emitStatusChanged();
			await leavePromise;
		});

		expect(client.leaveHousehold).toHaveBeenCalledWith("hh_1");
		expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" });
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});

	it("shows the confirm at the timeout when the initial queue stats read never resolves", async () => {
		const uploadQueue = uploadQueueFixture({ count: 1, connected: true });
		const stats = deferred<UploadQueueStats>();
		uploadQueue.getUploadQueueStats.mockReturnValue(stats.promise);
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => false);
		jest.useFakeTimers();

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});

		expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1);
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();

		await act(async () => {
			jest.advanceTimersByTime(9999);
			await Promise.resolve();
		});

		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();

		await act(async () => {
			jest.advanceTimersByTime(1);
			await leavePromise;
		});

		expect(confirmDiscardUnsyncedChanges).toHaveBeenCalledTimes(1);
		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(reloadSession).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});

	it("shows the confirm when the initial queue stats read rejects", async () => {
		const uploadQueue = uploadQueueFixture({ count: 1, connected: true });
		uploadQueue.getUploadQueueStats.mockRejectedValueOnce(
			new Error("stats read failed"),
		);
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => false);

		await act(async () => {
			await result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
		});

		expect(confirmDiscardUnsyncedChanges).toHaveBeenCalledTimes(1);
		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(reloadSession).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
		expect(result.current.state).toMatchObject({
			status: "ready",
			operation: { status: "idle" },
		});
	});

	it("keeps the Membership intact when the timeout confirm is canceled", async () => {
		const uploadQueue = uploadQueueFixture({ count: 1, connected: true });
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => false);
		jest.useFakeTimers();

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});

		expect(client.leaveHousehold).not.toHaveBeenCalled();

		await act(async () => {
			jest.advanceTimersByTime(10_000);
			await Promise.resolve();
		});

		expect(confirmDiscardUnsyncedChanges).toHaveBeenCalledTimes(1);
		expect(client.leaveHousehold).not.toHaveBeenCalled();

		await act(async () => {
			await leavePromise;
		});

		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(reloadSession).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
		expect(result.current.state).toMatchObject({
			status: "ready",
			operation: { status: "idle" },
		});
	});

	it("keeps the Membership intact when offline and leave-anyway is canceled", async () => {
		const uploadQueue = uploadQueueFixture({ count: 1, connected: false });
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => false);

		await act(async () => {
			await result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
		});

		expect(confirmDiscardUnsyncedChanges).toHaveBeenCalledTimes(1);
		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(reloadSession).not.toHaveBeenCalled();
		expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1);
		expect(uploadQueue.listenerCount()).toBe(0);
		expect(result.current.state).toMatchObject({
			status: "ready",
			operation: { status: "idle" },
		});
	});

	it("leaves without confirm when offline with an empty upload queue", async () => {
		const uploadQueue = uploadQueueFixture({ count: 0, connected: false });
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => true);

		await act(async () => {
			await result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
		});

		expect(client.leaveHousehold).toHaveBeenCalledWith("hh_1");
		expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" });
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});

	it("keeps the Membership intact when the queue goes offline mid-drain and leave-anyway is canceled", async () => {
		const uploadQueue = uploadQueueFixture({ count: 1, connected: true });
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => false);

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1));

		await act(async () => {
			uploadQueue.setConnected(false);
			uploadQueue.emitStatusChanged();
			await leavePromise;
		});

		expect(confirmDiscardUnsyncedChanges).toHaveBeenCalledTimes(1);
		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(reloadSession).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
		expect(result.current.state).toMatchObject({
			status: "ready",
			operation: { status: "idle" },
		});
	});

	it("leaves without confirm when a stale upload error is present before the queue drains", async () => {
		const uploadQueue = uploadQueueFixture({
			count: 1,
			connected: true,
			uploadError: true,
		});
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => true);

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1));

		await act(async () => {
			uploadQueue.setCount(0);
			uploadQueue.emitStatusChanged();
			await leavePromise;
		});

		expect(client.leaveHousehold).toHaveBeenCalledWith("hh_1");
		expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" });
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});

	it("leaves without confirm when a stale upload error appears mid-drain and the queue drains", async () => {
		const uploadQueue = uploadQueueFixture({ count: 1, connected: true });
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => true);

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1));

		await act(async () => {
			uploadQueue.setUploadError(true);
			uploadQueue.emitStatusChanged();
			await Promise.resolve();
		});

		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();

		await act(async () => {
			uploadQueue.setCount(0);
			uploadQueue.emitStatusChanged();
			await leavePromise;
		});

		expect(client.leaveHousehold).toHaveBeenCalledWith("hh_1");
		expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" });
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});

	it("waits while the upload queue is connecting and leaves after it connects and drains", async () => {
		const uploadQueue = uploadQueueFixture({
			count: 1,
			connected: false,
			connecting: true,
		});
		const { result, client, reloadSession } = await renderUseHouseholdSettings({
			uploadQueue,
		});
		const confirmDiscardUnsyncedChanges = jest.fn(async () => true);

		let leavePromise = Promise.resolve();
		await act(async () => {
			leavePromise = result.current.actions.leaveHousehold({
				confirmDiscardUnsyncedChanges,
			});
			await Promise.resolve();
		});
		await waitFor(() => expect(uploadQueue.subscribe).toHaveBeenCalledTimes(1));

		expect(client.leaveHousehold).not.toHaveBeenCalled();
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();

		await act(async () => {
			uploadQueue.setConnected(true);
			uploadQueue.setConnecting(false);
			uploadQueue.setCount(0);
			uploadQueue.emitStatusChanged();
			await leavePromise;
		});

		expect(client.leaveHousehold).toHaveBeenCalledWith("hh_1");
		expect(reloadSession).toHaveBeenCalledWith({ mode: "retireCurrent" });
		expect(confirmDiscardUnsyncedChanges).not.toHaveBeenCalled();
		expect(uploadQueue.listenerCount()).toBe(0);
	});
});

async function renderUseHouseholdSettings({
	client = householdClientFixture(),
	uploadQueue = uploadQueueFixture(),
	reloadSession = jest.fn(),
}: {
	client?: TestHouseholdClient;
	uploadQueue?: TestUploadQueueMonitor;
	reloadSession?: jest.Mock;
} = {}) {
	const rendered = await renderHook(
		() =>
			useHouseholdSettings(
				sessionFixture(),
				client,
				reloadSession,
				uploadQueue,
			),
		{ wrapper: ToastHarness },
	);

	await waitFor(() =>
		expect(rendered.result.current.state.status).toBe("ready"),
	);

	return { ...rendered, client, uploadQueue, reloadSession };
}

type TestHouseholdClient = HouseholdApiClient & {
	leaveHousehold: jest.MockedFunction<HouseholdApiClient["leaveHousehold"]>;
};

type TestUploadQueueMonitor = jest.Mocked<UploadQueueMonitor> & {
	emitStatusChanged: () => void;
	listenerCount: () => number;
	setCount: (count: number) => void;
	setConnected: (connected: boolean) => void;
	setConnecting: (connecting: boolean) => void;
	setUploadError: (uploadError: boolean) => void;
};

function uploadQueueFixture({
	count: initialCount = 0,
	connected = true,
	connecting = false,
	uploadError = false,
}: {
	count?: number;
	connected?: boolean;
	connecting?: boolean;
	uploadError?: boolean;
} = {}): TestUploadQueueMonitor {
	let count = initialCount;
	let state: UploadQueueState = { connected, connecting, uploadError };
	const listeners = new Set<() => void>();

	return {
		getUploadQueueStats: jest.fn(async () => ({ count })),
		getUploadQueueState: jest.fn(() => state),
		subscribe: jest.fn((onChange) => {
			listeners.add(onChange);
			return () => listeners.delete(onChange);
		}),
		emitStatusChanged() {
			for (const listener of listeners) listener();
		},
		listenerCount() {
			return listeners.size;
		},
		setCount(nextCount) {
			count = nextCount;
		},
		setConnected(nextConnected) {
			state = { ...state, connected: nextConnected };
		},
		setConnecting(nextConnecting) {
			state = { ...state, connecting: nextConnecting };
		},
		setUploadError(nextUploadError) {
			state = { ...state, uploadError: nextUploadError };
		},
	};
}

function householdClientFixture(): TestHouseholdClient {
	const leaveHousehold: jest.MockedFunction<
		HouseholdApiClient["leaveHousehold"]
	> = jest.fn(async (_householdId: string) => leaveHouseholdResponseFixture());
	return {
		async createHousehold() {
			return { id: "hh_new", name: "New" };
		},
		async renameHousehold(input) {
			return {
				id: input.householdId,
				name: input.name,
			};
		},
		async listMembers() {
			return [
				{
					membershipId: "mbr_1",
					userId: "usr_1",
					role: "owner",
					displayName: "Avery",
				},
			];
		},
		async removeMember() {},
		async setMemberRole() {},
		leaveHousehold,
		async listInvitations() {
			return [];
		},
		async createInvitation() {
			return {
				invitation: invitationRecordFixture(),
				emailDelivery: { status: "not_requested" },
				reusedExisting: false,
			};
		},
		async revokeInvitation() {
			return invitationRecordFixture();
		},
		async getJoinCode() {
			return disabledJoinCodeFixture("hh_1");
		},
		async regenerateJoinCode() {
			return joinCodeFixture();
		},
		async setJoinCodeEnabled(input) {
			return input.enabled
				? joinCodeFixture()
				: disabledJoinCodeFixture(input.householdId);
		},
		async switchHousehold() {},
		async previewInvitation() {
			return { available: false };
		},
		async acceptInvitation() {},
		async previewJoinCode() {
			return { available: false };
		},
		async joinByCode() {},
	};
}

function sessionFixture(): AuthenticatedAppSession {
	return {
		user: {
			id: "usr_1",
			email: "avery@example.com",
			displayName: "Avery",
			firstName: "Avery",
			lastName: null,
		},
		activeHousehold: { id: "hh_1", name: "Avery" },
		households: [{ id: "hh_1", name: "Avery", role: "owner", isActive: true }],
		activeMember: {
			id: "mbr_1",
			userId: "usr_1",
			role: "owner",
			displayName: "Avery",
		},
		members: [],
	};
}

function joinCodeFixture(): HouseholdJoinCode {
	return {
		enabled: true,
		id: "hjc_1",
		householdId: "hh_1",
		code: "ABCD1234",
		joinUrl: "https://example.com/join/ABCD1234",
		createdAt: 1,
	};
}

function disabledJoinCodeFixture(householdId: string): HouseholdJoinCode {
	return {
		enabled: false,
		householdId,
	};
}

function leaveHouseholdResponseFixture(): Awaited<
	ReturnType<HouseholdApiClient["leaveHousehold"]>
> {
	return {
		left: true,
		promotedMembershipId: null,
	};
}

function invitationRecordFixture(): InvitationRecord {
	return {
		id: "inv_1",
		householdId: "hh_1",
		email: null,
		createdByUserId: "usr_1",
		createdAt: 1,
		expiresAt: 2,
		acceptedAt: null,
		acceptedByUserId: null,
		revokedAt: null,
		acceptUrl: "https://example.com/invitations/inv_1",
	};
}

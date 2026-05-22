import type { ActiveListSyncCoordinator } from "@/components/active-list";

export type MockActiveListSyncCoordinator = {
	[K in keyof ActiveListSyncCoordinator]: jest.MockedFunction<
		ActiveListSyncCoordinator[K]
	>;
};

export function createMockSyncCoordinatorFactory() {
	const created: MockActiveListSyncCoordinator[] = [];
	const createDefaultSyncCoordinator = jest.fn(
		(deps: { syncAuthorized: boolean }) => {
			const coordinator: MockActiveListSyncCoordinator = {
				getStatus: jest.fn(() => (deps.syncAuthorized ? "synced" : "offline")),
				subscribe: jest.fn<
					ReturnType<ActiveListSyncCoordinator["subscribe"]>,
					Parameters<ActiveListSyncCoordinator["subscribe"]>
				>(() => ({ remove() {} })),
				start: jest.fn(),
				stop: jest.fn(async () => undefined),
				requestSync: jest.fn<
					ReturnType<ActiveListSyncCoordinator["requestSync"]>,
					Parameters<ActiveListSyncCoordinator["requestSync"]>
				>(async () => null),
			};
			created.push(coordinator);
			return coordinator;
		},
	);

	return { createDefaultSyncCoordinator, created };
}

export const mockSyncCoordinatorFactory = createMockSyncCoordinatorFactory();

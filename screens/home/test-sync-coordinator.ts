import type { ActiveListManagedSyncCoordinator } from "@/components/active-list";

export type MockActiveListManagedSyncCoordinator = {
	[K in keyof ActiveListManagedSyncCoordinator]: jest.MockedFunction<
		ActiveListManagedSyncCoordinator[K]
	>;
};

export function createMockSyncCoordinatorFactory() {
	const created: MockActiveListManagedSyncCoordinator[] = [];
	const createDefaultSyncCoordinator = jest.fn(
		(deps: { syncAuthorized: boolean }) => {
			const coordinator: MockActiveListManagedSyncCoordinator = {
				getStatus: jest.fn(() => (deps.syncAuthorized ? "synced" : "offline")),
				subscribe: jest.fn<
					ReturnType<ActiveListManagedSyncCoordinator["subscribe"]>,
					Parameters<ActiveListManagedSyncCoordinator["subscribe"]>
				>(() => ({ remove() {} })),
				start: jest.fn(),
				stop: jest.fn(async () => undefined),
				requestSync: jest.fn<
					ReturnType<ActiveListManagedSyncCoordinator["requestSync"]>,
					Parameters<ActiveListManagedSyncCoordinator["requestSync"]>
				>(async () => null),
			};
			created.push(coordinator);
			return coordinator;
		},
	);

	return { createDefaultSyncCoordinator, created };
}

export const mockSyncCoordinatorFactory = createMockSyncCoordinatorFactory();

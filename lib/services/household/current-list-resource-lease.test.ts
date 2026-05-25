import type {
	ActiveListDataSource,
	ActiveListItem,
} from "@/components/active-list";
import {
	createCurrentListResourceLease,
	isStaleCurrentListResourceError,
} from "./current-list-resource-lease";

describe("createCurrentListResourceLease", () => {
	it("rejects new calls after retirement with a typed stale-resource error", async () => {
		const dataSource = activeListDataSourceFixture();
		const lease = createCurrentListResourceLease(dataSource);

		lease.retire();

		await expect(lease.dataSource.load()).rejects.toMatchObject({
			code: "stale_current_list_resource",
		});
		await expectStaleResourceError(lease.dataSource.addItem("Milk"));
		await expectStaleResourceError(
			lease.dataSource.setItemChecked("itm_milk", true),
		);
		await expectStaleResourceError(lease.dataSource.pull());
		await expectStaleResourceError(lease.dataSource.sync());
		expect(dataSource.load).not.toHaveBeenCalled();
		expect(dataSource.addItem).not.toHaveBeenCalled();
		expect(dataSource.setItemChecked).not.toHaveBeenCalled();
		expect(dataSource.pull).not.toHaveBeenCalled();
		expect(dataSource.sync).not.toHaveBeenCalled();
	});

	it("does not classify Item/List service errors as stale-resource errors", async () => {
		const serviceError = new Error("item service failed");
		const lease = createCurrentListResourceLease(
			activeListDataSourceFixture({
				addItem: jest.fn().mockRejectedValue(serviceError),
			}),
		);

		let thrown: unknown;
		try {
			await lease.dataSource.addItem("Milk");
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBe(serviceError);
		expect(isStaleCurrentListResourceError(thrown)).toBe(false);
	});

	it("waits for accepted writes to settle before closing a retired resource", async () => {
		const write = deferred<ActiveListItem>();
		const close = jest.fn().mockResolvedValue(undefined);
		const lease = createCurrentListResourceLease(
			activeListDataSourceFixture({
				addItem: jest.fn(() => write.promise),
				close,
			}),
		);

		const acceptedWrite = lease.dataSource.addItem("Milk");
		lease.retire();
		const closing = lease.closeWhenDrained();

		await Promise.resolve();
		expect(close).not.toHaveBeenCalled();
		await expectStaleResourceError(lease.dataSource.addItem("Eggs"));

		write.resolve({
			id: "itm_new",
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		});
		await acceptedWrite;
		await closing;

		expect(close).toHaveBeenCalledTimes(1);
	});

	it("waits for accepted sync operations to settle before closing a retired resource", async () => {
		const sync = deferred<{ changed: boolean }>();
		const close = jest.fn().mockResolvedValue(undefined);
		const lease = createCurrentListResourceLease(
			activeListDataSourceFixture({
				sync: jest.fn(() => sync.promise),
				close,
			}),
		);

		const acceptedSync = lease.dataSource.sync();
		lease.retire();
		const closing = lease.closeWhenDrained();

		await Promise.resolve();
		expect(close).not.toHaveBeenCalled();

		sync.resolve({ changed: false });
		await acceptedSync;
		await closing;

		expect(close).toHaveBeenCalledTimes(1);
	});
});

function activeListDataSourceFixture(
	overrides: Partial<ActiveListDataSource> = {},
): ActiveListDataSource {
	return {
		syncAuthorized: true,
		load: jest.fn().mockResolvedValue({
			householdName: "Avery",
			listName: "Groceries",
			items: [],
		}),
		addItem: jest.fn().mockResolvedValue({
			id: "itm_milk",
			name: "Milk",
			checked: false,
			checkedByMemberName: null,
		}),
		setItemChecked: jest.fn().mockResolvedValue(undefined),
		pull: jest.fn().mockResolvedValue({ changed: false }),
		sync: jest.fn().mockResolvedValue({ changed: false }),
		close: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

async function expectStaleResourceError(promise: Promise<unknown>) {
	let thrown: unknown;
	try {
		await promise;
	} catch (error) {
		thrown = error;
	}
	expect(isStaleCurrentListResourceError(thrown)).toBe(true);
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});

	return { promise, resolve };
}

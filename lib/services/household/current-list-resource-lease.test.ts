import type { ActiveListItem } from "@/components/active-list";
import { activeListDataSourceFixture } from "@/db/fixtures/active-household";
import {
	createCurrentListResourceLease,
	isStaleCurrentListResourceError,
} from "./current-list-resource-lease";

describe("createCurrentListResourceLease", () => {
	it("rejects new calls after retirement with a typed stale-resource error", async () => {
		const dataSource = activeListDataSourceFixture();
		const lease = createCurrentListResourceLease(dataSource);

		const closing = lease.retireAndClose();

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
		await closing;
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
		const closing = lease.retireAndClose();

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
		const closing = lease.retireAndClose();

		await Promise.resolve();
		expect(close).not.toHaveBeenCalled();

		sync.resolve({ changed: false });
		await acceptedSync;
		await closing;

		expect(close).toHaveBeenCalledTimes(1);
	});
	it("stops sync before closing the drained resource", async () => {
		const events: string[] = [];
		const lease = createCurrentListResourceLease(
			activeListDataSourceFixture({
				close: jest.fn(async () => {
					events.push("close");
				}),
			}),
		);
		const stopSync = jest.fn(async () => {
			events.push("stop");
		});

		await lease.retireAndClose({ stopSync });

		expect(events).toEqual(["stop", "close"]);
	});

	it("still closes the resource when stopping sync fails", async () => {
		const stopError = new Error("stop failed");
		const close = jest.fn().mockResolvedValue(undefined);
		const lease = createCurrentListResourceLease(
			activeListDataSourceFixture({ close }),
		);

		await expect(
			lease.retireAndClose({
				stopSync: jest.fn().mockRejectedValue(stopError),
			}),
		).rejects.toBe(stopError);

		expect(close).toHaveBeenCalledTimes(1);
	});
});

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

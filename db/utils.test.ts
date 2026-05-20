import { createDatabaseOperationQueue } from "@/db/utils";

describe("createDatabaseOperationQueue", () => {
	it("serializes operations for one database handle", async () => {
		const enqueueDatabaseOperation = createDatabaseOperationQueue();
		const first = deferred<string>();
		const calls: string[] = [];

		const firstOperation = enqueueDatabaseOperation(async () => {
			calls.push("first:start");
			const result = await first.promise;
			calls.push("first:end");
			return result;
		});
		await Promise.resolve();

		const secondOperation = enqueueDatabaseOperation(async () => {
			calls.push("second");
			return "second";
		});
		await Promise.resolve();

		expect(calls).toEqual(["first:start"]);

		first.resolve("first");
		await expect(firstOperation).resolves.toBe("first");
		await expect(secondOperation).resolves.toBe("second");
		expect(calls).toEqual(["first:start", "first:end", "second"]);
	});

	it("continues serializing after an operation rejects", async () => {
		const enqueueDatabaseOperation = createDatabaseOperationQueue();
		const error = new Error("write failed");
		const calls: string[] = [];

		const failedOperation = enqueueDatabaseOperation(async () => {
			calls.push("failed");
			throw error;
		});
		const nextOperation = enqueueDatabaseOperation(async () => {
			calls.push("next");
			return "next";
		});

		await expect(failedOperation).rejects.toThrow(error);
		await expect(nextOperation).resolves.toBe("next");
		expect(calls).toEqual(["failed", "next"]);
	});
});

function deferred<T>() {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});
	if (!resolve) {
		throw new Error("Unable to create deferred promise");
	}

	return { promise, resolve };
}

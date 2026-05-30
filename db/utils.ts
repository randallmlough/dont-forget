import { z } from "zod";

export type EnqueueDatabaseOperation = <T>(
	operation: () => Promise<T>,
) => Promise<T>;

export const sqlNumberSchema = z
	.union([z.number(), z.string()])
	.transform((value, ctx) => {
		const number = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(number)) {
			ctx.addIssue({
				code: "custom",
				message: "Expected SQL number column to be finite",
			});
			return z.NEVER;
		}

		return number;
	});

export function createDatabaseOperationQueue(): EnqueueDatabaseOperation {
	let operationQueue = Promise.resolve();

	return function enqueueDatabaseOperation<T>(
		operation: () => Promise<T>,
	): Promise<T> {
		const run = operationQueue.then(operation, operation);
		operationQueue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};
}

export async function runWithSqliteBusyRetry<T>(
	operation: () => Promise<T>,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 20; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			if (!isSqliteBusyError(error)) throw error;
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}
	throw lastError;
}

function isSqliteBusyError(error: unknown): boolean {
	const message =
		typeof error === "object" && error !== null && "message" in error
			? String(error.message)
			: String(error);
	return (
		message.includes("SQLITE_BUSY") || message.includes("database is locked")
	);
}

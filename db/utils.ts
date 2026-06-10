import { z } from "zod";

/**
 * Migration tracking table shared by every migrator invocation and by the
 * schema staleness gate (ADR-0013), which reads it on local replicas. Always
 * pass this to `migrate()` so a drizzle-orm default change cannot silently
 * split the writer and the reader onto different tables.
 */
export const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

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
	if (
		message.includes("SQLITE_BUSY") ||
		message.includes("database is locked")
	) {
		return true;
	}

	const cause =
		typeof error === "object" && error !== null && "cause" in error
			? (error as { cause?: unknown }).cause
			: undefined;
	return cause ? isSqliteBusyError(cause) : false;
}

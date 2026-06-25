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

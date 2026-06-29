import { z } from "zod";

export const sqlTimestampMillisSchema = z
	.union([z.number(), z.string(), z.date()])
	.transform((value, ctx) => {
		const timestamp =
			value instanceof Date
				? value.getTime()
				: typeof value === "number"
					? value
					: timestampFromString(value);

		if (!Number.isFinite(timestamp)) {
			ctx.addIssue({
				code: "custom",
				message: "Expected SQL timestamp column to be finite",
			});
			return z.NEVER;
		}

		return Math.trunc(timestamp);
	});

export function timestampMillisToSqlText(timestamp: number): string {
	return new Date(timestamp).toISOString();
}

function timestampFromString(value: string): number {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : Date.parse(value);
}

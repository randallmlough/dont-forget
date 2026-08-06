import { z } from "zod";

// PowerSync stores the product tables' timestamps as ISO-8601 text — that is the
// representation PR-A's sync stream emits and `lib/powersync/schema.ts` declares
// (`column.text`). The applicator (`db/server/sync`) also expects ISO text: it
// pushes the raw `updated_at` straight into a Postgres `timestamptz` param. The
// services, however, work in epoch-millis numbers (monotonic LWW clocks, the
// `Item`/`List` types). So we parse text → millis on read and serialize
// millis → text on write, keeping the on-wire representation ISO throughout.
export const sqlTimestampMillisSchema = z
	.union([z.number(), z.string()])
	.transform((value, ctx) => {
		const millis = typeof value === "number" ? value : Date.parse(value);
		if (!Number.isFinite(millis)) {
			ctx.addIssue({
				code: "custom",
				message: "Expected an ISO-8601 timestamp or epoch-millis number",
			});
			return z.NEVER;
		}

		return Math.trunc(millis);
	});

export function timestampMillisToSqlText(millis: number): string {
	return new Date(millis).toISOString();
}

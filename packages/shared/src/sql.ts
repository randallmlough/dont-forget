import { z } from "zod";

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

import { sqlNumberSchema } from "@/shared/sql";

describe("sqlNumberSchema", () => {
	it("passes finite numbers through unchanged", () => {
		expect(sqlNumberSchema.parse(42)).toBe(42);
	});

	it("coerces finite numeric strings to numbers", () => {
		expect(sqlNumberSchema.parse("42")).toBe(42);
	});

	it("rejects non-finite values", () => {
		const result = sqlNumberSchema.safeParse("not-a-number");
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(
			"Expected SQL number column to be finite",
		);
	});
});

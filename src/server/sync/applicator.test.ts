import { BATCH_MAX, batchSchema } from "./applicator";

describe("batchSchema", () => {
	it("allows BATCH_MAX ops and rejects the next one", () => {
		expect(batchSchema.safeParse({ batch: ops(BATCH_MAX) }).success).toBe(true);
		expect(batchSchema.safeParse({ batch: ops(BATCH_MAX + 1) }).success).toBe(
			false,
		);
	});
});

function ops(count: number): unknown[] {
	return Array.from({ length: count }, (_, index) => ({
		op: "PUT",
		table: "lists",
		id: `list_${index}`,
		data: { name: "Groceries" },
	}));
}

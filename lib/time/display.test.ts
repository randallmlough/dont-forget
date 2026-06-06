import { formatRelativeDateLabel } from "./display";

describe("formatRelativeDateLabel", () => {
	it("labels timestamps from the viewer's local today", () => {
		expect(
			formatRelativeDateLabel(
				new Date(2026, 5, 5, 9, 30).getTime(),
				new Date(2026, 5, 5, 22, 15).getTime(),
			),
		).toBe("today");
	});

	it("labels timestamps from the viewer's local yesterday", () => {
		expect(
			formatRelativeDateLabel(
				new Date(2026, 5, 4, 23, 30).getTime(),
				new Date(2026, 5, 5, 1, 15).getTime(),
			),
		).toBe("yesterday");
	});

	it("formats older current-year dates without the year", () => {
		expect(
			formatRelativeDateLabel(
				new Date(2026, 1, 3, 12).getTime(),
				new Date(2026, 5, 5, 12).getTime(),
			),
		).toBe("Feb 3");
	});

	it("formats prior-year dates with the year", () => {
		expect(
			formatRelativeDateLabel(
				new Date(2025, 11, 31, 12).getTime(),
				new Date(2026, 0, 2, 12).getTime(),
			),
		).toBe("Dec 31, 2025");
	});

	it("throws for non-epoch-millisecond inputs", () => {
		expect(() => formatRelativeDateLabel(Number.NaN, Date.now())).toThrow(
			"timestampMs must be an epoch millisecond integer",
		);
		expect(() => formatRelativeDateLabel(1.5, Date.now())).toThrow(
			"timestampMs must be an epoch millisecond integer",
		);
		expect(() =>
			formatRelativeDateLabel(Date.now(), Number.POSITIVE_INFINITY),
		).toThrow("nowMs must be an epoch millisecond integer");
	});
});

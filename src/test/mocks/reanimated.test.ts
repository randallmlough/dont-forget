import { Extrapolation, interpolate } from "./reanimated";

/**
 * The Reanimated double stands in for behavior the real library runs on the
 * worklets runtime, so what it does with an interpolation range has to match
 * the real thing: tests read carousel geometry straight out of it.
 */
describe("Reanimated double", () => {
	describe("interpolate", () => {
		it("reaches the interior peak of an output range that turns back on itself", () => {
			// The carousel's page opacity: full on the page filling the viewport,
			// dimmed on the pages either side of it.
			expect(
				interpolate(0, [-1, 0, 1], [0.85, 1, 0.85], Extrapolation.CLAMP),
			).toBe(1);
			expect(
				interpolate(-0.5, [-1, 0, 1], [0.85, 1, 0.85], Extrapolation.CLAMP),
			).toBeCloseTo(0.925);
			expect(
				interpolate(0.5, [-1, 0, 1], [0.85, 1, 0.85], Extrapolation.CLAMP),
			).toBeCloseTo(0.925);
		});

		it("holds each end of the output range for values outside the input range", () => {
			expect(
				interpolate(-4, [-1, 0, 1], [18, 0, -18], Extrapolation.CLAMP),
			).toBe(18);
			expect(
				interpolate(4, [-1, 0, 1], [18, 0, -18], Extrapolation.CLAMP),
			).toBe(-18);
		});

		it("keeps extrapolating past the range without clamping", () => {
			expect(interpolate(2, [0, 1], [0, 10])).toBe(20);
			expect(interpolate(-1, [0, 1], [0, 10])).toBe(-10);
		});
	});
});

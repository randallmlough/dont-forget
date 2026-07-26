import { renderHook } from "@testing-library/react-native";
import {
	Extrapolation,
	interpolate,
	settleAnimations,
	useSharedValue,
	withSpring,
	withTiming,
} from "./reanimated";

/**
 * The Reanimated double stands in for behavior the real library runs on the
 * worklets runtime, so what it does with an interpolation range and with an
 * interrupted animation has to match the real thing: tests read carousel
 * opacity and picker transitions straight out of it.
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

	describe("animations", () => {
		it("lands on the target value and settles as finished", async () => {
			const onSettled = jest.fn();
			const { result } = await renderHook(() => useSharedValue(0));

			result.current.set(withTiming(1, undefined, onSettled));

			expect(result.current.get()).toBe(1);
			expect(onSettled).not.toHaveBeenCalled();

			settleAnimations();

			expect(onSettled).toHaveBeenCalledTimes(1);
			expect(onSettled).toHaveBeenCalledWith(true);
		});

		it("cancels the animation a new animation retargets", async () => {
			const onClosed = jest.fn();
			const onReopened = jest.fn();
			const { result } = await renderHook(() => useSharedValue(1));

			result.current.set(withSpring(0, undefined, onClosed));
			result.current.set(withSpring(1, undefined, onReopened));

			expect(onClosed).toHaveBeenCalledTimes(1);
			expect(onClosed).toHaveBeenCalledWith(false);
			expect(result.current.get()).toBe(1);

			settleAnimations();

			// The cancelled animation must not finish a second time when the one
			// that replaced it lands.
			expect(onClosed).toHaveBeenCalledTimes(1);
			expect(onReopened).toHaveBeenCalledWith(true);
		});

		it("cancels a running animation when a plain value is assigned", async () => {
			const onSettled = jest.fn();
			const { result } = await renderHook(() => useSharedValue(0));

			result.current.set(withSpring(1, undefined, onSettled));
			result.current.set(0.5);

			expect(onSettled).toHaveBeenCalledTimes(1);
			expect(onSettled).toHaveBeenCalledWith(false);
			expect(result.current.get()).toBe(0.5);

			settleAnimations();

			expect(onSettled).toHaveBeenCalledTimes(1);
		});

		it("keeps updating a shared value from its current value", async () => {
			const { result } = await renderHook(() => useSharedValue(2));

			result.current.set((current) => current + 3);

			expect(result.current.get()).toBe(5);
		});
	});
});

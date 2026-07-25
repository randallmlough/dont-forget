import { useState } from "react";
import {
	FlatList,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	View,
} from "react-native";

/**
 * Jest double for `react-native-reanimated`. The real library animates on the
 * worklets runtime behind the native scroll-event bus, neither of which exists
 * under Jest, so tests drive the same inputs synchronously instead:
 *
 * - shared values are mutable boxes that survive re-renders,
 * - `useAnimatedStyle` evaluates its updater on every render, so a test reads
 *   the current animated style by re-rendering after moving a shared value,
 * - animated scroll handlers run from the JS `scroll` event that React Native
 *   Testing Library fires,
 * - `withSpring` and `withTiming` land on their target value immediately but
 *   hold their completion callback until a test calls `settleAnimations`, so a
 *   test can assert what a surface does mid-transition and then finish it.
 */

export type MockSharedValue<Value> = {
	get: () => Value;
	set: (next: Value | ((current: Value) => Value)) => void;
};

type MockScrollHandler = (event: NativeScrollEvent) => void;

type MockExtrapolation = "clamp" | "extend" | "identity";

export const Easing = {
	cubic: (value: number) => value,
	out: (easing: (value: number) => number) => easing,
};

export const ReduceMotion = {
	System: "system",
	Always: "always",
	Never: "never",
} as const;

export const Extrapolation = {
	CLAMP: "clamp",
	EXTEND: "extend",
	IDENTITY: "identity",
} as const;

export function useSharedValue<Value>(initial: Value): MockSharedValue<Value> {
	const [sharedValue] = useState<MockSharedValue<Value>>(() => {
		let current = initial;
		return {
			get: () => current,
			set: (next) => {
				current =
					typeof next === "function"
						? (next as (value: Value) => Value)(current)
						: next;
			},
		};
	});
	return sharedValue;
}

export function useAnimatedStyle<Style>(updater: () => Style): Style {
	return updater();
}

export function useAnimatedScrollHandler(
	handlers: MockScrollHandler | { onScroll?: MockScrollHandler },
): (event: NativeSyntheticEvent<NativeScrollEvent>) => void {
	return (event) => {
		const onScroll =
			typeof handlers === "function" ? handlers : handlers.onScroll;
		onScroll?.(event.nativeEvent);
	};
}

/**
 * Piecewise-linear interpolation. `"clamp"` holds the value at the edges of the
 * output range, which is the only extrapolation mode the app relies on.
 */
export function interpolate(
	value: number,
	input: readonly number[],
	output: readonly number[],
	extrapolation: MockExtrapolation = "extend",
): number {
	const lastIndex = input.length - 1;
	let segment = 0;
	while (segment < lastIndex - 1 && value > input[segment + 1]) {
		segment += 1;
	}
	const inputStart = input[segment];
	const inputEnd = input[segment + 1];
	const outputStart = output[segment];
	const outputEnd = output[segment + 1];
	const progress =
		inputEnd === inputStart
			? 0
			: (value - inputStart) / (inputEnd - inputStart);
	const interpolated = outputStart + progress * (outputEnd - outputStart);
	if (extrapolation !== "clamp") return interpolated;
	return Math.min(
		Math.max(interpolated, Math.min(output[0], output[lastIndex])),
		Math.max(output[0], output[lastIndex]),
	);
}

type MockAnimationCallback = (finished?: boolean) => void;

const runningAnimations: MockAnimationCallback[] = [];

/** Finishes every animation that is still holding its completion callback. */
export function settleAnimations(): void {
	for (const settled of runningAnimations.splice(0)) settled(true);
}

export function withSpring<Value>(
	value: Value,
	_config?: unknown,
	onSettled?: MockAnimationCallback,
): Value {
	if (onSettled) runningAnimations.push(onSettled);
	return value;
}

export function withTiming<Value>(
	value: Value,
	_config?: unknown,
	onSettled?: MockAnimationCallback,
): Value {
	if (onSettled) runningAnimations.push(onSettled);
	return value;
}

export function runOnJS<Args extends unknown[]>(
	target: (...args: Args) => void,
): (...args: Args) => void {
	return target;
}

/**
 * The system setting is off in tests. Suites covering the reduced-motion
 * branch replace this export with their own module mock.
 */
export function useReducedMotion(): boolean {
	return false;
}

export default { FlatList, View };

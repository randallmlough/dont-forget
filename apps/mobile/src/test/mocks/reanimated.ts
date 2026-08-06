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
 *   test can assert what a surface does mid-transition and then finish it;
 *   `withRepeat` preserves that target without looping under Jest,
 * - assigning anything to a shared value that is still holding a completion
 *   callback cancels it with `finished: false`, the way the real library
 *   cancels an animation that a new one retargets.
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
		let pending: RunningAnimation | null = null;
		return {
			get: () => current,
			set: (next) => {
				pending?.settle(false);
				if (isMockAnimation<Value>(next)) {
					current = next.toValue;
					if (next.onSettled) {
						pending = startAnimation(next.onSettled, () => {
							pending = null;
						});
					}
					return;
				}
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
 * Piecewise-linear interpolation. `"clamp"`, the only extrapolation mode the
 * app relies on, holds the ends of the output range for values outside the
 * input range; inside it the piecewise result stands, so a range that turns
 * back on itself, such as `[0.85, 1, 0.85]`, still reaches its interior peak.
 */
export function interpolate(
	value: number,
	input: readonly number[],
	output: readonly number[],
	extrapolation: MockExtrapolation = "extend",
): number {
	const lastIndex = input.length - 1;
	if (extrapolation === "clamp") {
		if (value <= input[0]) return output[0];
		if (value >= input[lastIndex]) return output[lastIndex];
	}
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
	return outputStart + progress * (outputEnd - outputStart);
}

type MockAnimationCallback = (finished?: boolean) => void;

/**
 * What `withSpring` and `withTiming` hand to `set`, so a shared value knows it
 * was given an animation rather than a plain value and can cancel the one it is
 * already running. It stands in for the animation object the real library
 * builds, which is equally opaque to the code assigning it.
 */
const MOCK_ANIMATION = Symbol("mockAnimation");

type MockAnimation<Value> = {
	[MOCK_ANIMATION]: true;
	toValue: Value;
	onSettled: MockAnimationCallback | undefined;
};

function isMockAnimation<Value>(next: unknown): next is MockAnimation<Value> {
	return typeof next === "object" && next !== null && MOCK_ANIMATION in next;
}

/** An animation still holding its completion callback. */
type RunningAnimation = { settle: (finished: boolean) => void };

const runningAnimations = new Set<RunningAnimation>();

function startAnimation(
	onSettled: MockAnimationCallback,
	onRelease: () => void,
): RunningAnimation {
	const animation: RunningAnimation = {
		settle: (finished) => {
			runningAnimations.delete(animation);
			onRelease();
			onSettled(finished);
		},
	};
	runningAnimations.add(animation);
	return animation;
}

/** Finishes every animation that is still holding its completion callback. */
export function settleAnimations(): void {
	for (const animation of [...runningAnimations]) animation.settle(true);
}

function animate<Value>(
	toValue: Value,
	onSettled: MockAnimationCallback | undefined,
): Value {
	const animation: MockAnimation<Value> = {
		[MOCK_ANIMATION]: true,
		toValue,
		onSettled,
	};
	return animation as unknown as Value;
}

export function withSpring<Value>(
	value: Value,
	_config?: unknown,
	onSettled?: MockAnimationCallback,
): Value {
	return animate(value, onSettled);
}

export function withTiming<Value>(
	value: Value,
	_config?: unknown,
	onSettled?: MockAnimationCallback,
): Value {
	return animate(value, onSettled);
}

export function withRepeat<Value>(animation: Value): Value {
	return animation;
}

/**
 * The system setting is off in tests. Suites covering the reduced-motion
 * branch replace this export with their own module mock.
 */
export function useReducedMotion(): boolean {
	return false;
}

export default { FlatList, View };

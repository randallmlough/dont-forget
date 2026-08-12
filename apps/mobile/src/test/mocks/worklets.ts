/**
 * Jest double for `react-native-worklets`. The real `scheduleOnRN` hands a call
 * from the worklets runtime back to the React Native runtime; under Jest there
 * is only one runtime, so the double calls the target where it stands. Tests
 * therefore observe the effect of a worklet's callback as soon as the input
 * that triggered it is driven.
 */

export function scheduleOnRN<Args extends unknown[]>(
	target: (...args: Args) => void,
	...args: Args
): void {
	target(...args);
}

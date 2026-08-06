import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

/**
 * Safe area metrics for surfaces that inset themselves: an iPhone-sized frame
 * with a home indicator along the bottom edge. `SafeAreaProvider` reports zero
 * insets until it measures itself, which never happens in the Jest harness, so
 * seeding the metrics is what makes those insets assertable.
 */
export function TestSafeAreaProvider({ children }: PropsWithChildren) {
	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 0, left: 0, right: 0, bottom: 24 },
			}}
		>
			{children}
		</SafeAreaProvider>
	);
}

import { act } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster, toast } from "@/client/ui/toast";

/**
 * Test support for the app-wide toast viewport. Toasts are raised through a
 * module-level store, so a test proves them by rendering a real `Toaster` and
 * querying the card text, then draining the store before the next test runs.
 */

const TEST_SAFE_AREA_METRICS = {
	frame: { x: 0, y: 0, width: 390, height: 844 },
	insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Renders children alongside a `Toaster`. `SafeAreaProvider` withholds its
 * children until it knows the insets, so the metrics are supplied up front.
 */
export function ToastHarness({ children }: { children: ReactNode }) {
	return (
		<SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
			{children}
			<Toaster />
		</SafeAreaProvider>
	);
}

/** Empties the module-level store so a leftover card cannot satisfy a later query. */
export async function drainToasts() {
	jest.useFakeTimers();
	await act(() => {
		toast.dismiss();
		jest.runOnlyPendingTimers();
	});
	jest.useRealTimers();
}

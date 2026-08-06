import type { PropsWithChildren } from "react";
import { View } from "react-native";

/**
 * Double for the pan gesture react-native-gesture-handler runs natively.
 *
 * Gestures are a native boundary with no deterministic JS harness, so tests
 * drive one through `panAcross`, which replays the begin/update/finalize
 * sequence the native recognizer emits. Only the pan surface the app uses is
 * modelled.
 */
type PanEvent = { x: number };

type PanCallbacks = {
	onBegin?: (event: PanEvent) => void;
	onUpdate?: (event: PanEvent) => void;
	onFinalize?: () => void;
};

let latestPan: PanCallbacks | null = null;

class PanGestureDouble {
	readonly callbacks: PanCallbacks = {};

	minDistance(): this {
		return this;
	}

	onBegin(callback: (event: PanEvent) => void): this {
		this.callbacks.onBegin = callback;
		return this;
	}

	onUpdate(callback: (event: PanEvent) => void): this {
		this.callbacks.onUpdate = callback;
		return this;
	}

	onFinalize(callback: () => void): this {
		this.callbacks.onFinalize = callback;
		return this;
	}
}

export const Gesture = {
	Pan(): PanGestureDouble {
		const gesture = new PanGestureDouble();
		latestPan = gesture.callbacks;
		return gesture;
	},
};

export function GestureDetector({ children }: PropsWithChildren) {
	return children;
}

export const GestureHandlerRootView = View;

/**
 * The steps the native recognizer reports, each its own event: where the finger
 * landed, where it moved to, and that it lifted. Callers drive them one at a
 * time so React renders between steps, the way it does between native touches.
 */
export function panBegin(touchPositionX: number): void {
	panCallbacks().onBegin?.({ x: touchPositionX });
}

export function panMove(touchPositionX: number): void {
	panCallbacks().onUpdate?.({ x: touchPositionX });
}

export function panEnd(): void {
	panCallbacks().onFinalize?.();
}

function panCallbacks(): PanCallbacks {
	if (!latestPan) {
		throw new Error("No pan gesture has been created yet");
	}
	return latestPan;
}

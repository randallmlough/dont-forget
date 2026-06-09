import {
	BottomSheet as ExpoBottomSheet,
	Group,
	RNHostView,
} from "@expo/ui/swift-ui";
import {
	background,
	containerRelativeFrame,
	presentationDetents,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactElement } from "react";
import { lightTheme } from "@/lib/unistyles/unistyles";

export type BottomSheetProps = {
	children: ReactElement;
	isPresented: boolean;
	onIsPresentedChange: (isPresented: boolean) => void;
};

export function BottomSheet({
	children,
	isPresented,
	onIsPresentedChange,
}: BottomSheetProps) {
	return (
		<ExpoBottomSheet
			isPresented={isPresented}
			onIsPresentedChange={onIsPresentedChange}
		>
			<Group
				modifiers={[
					presentationDetents(["medium", "large"]),
					presentationDragIndicator("visible"),
					containerRelativeFrame({ axes: "vertical", alignment: "top" }),
					background(lightTheme.colors.background),
				]}
			>
				<RNHostView>{children}</RNHostView>
			</Group>
		</ExpoBottomSheet>
	);
}

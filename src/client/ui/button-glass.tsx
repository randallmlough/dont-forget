import type { ButtonProps as SwiftUIButtonProps } from "@expo/ui/swift-ui";

import {
	ButtonGlassControl,
	type ButtonGlassSharedProps,
	type ButtonGlassSize,
} from "./button-glass-control";

export type { ButtonGlassSize };

export type ButtonGlassProps = ButtonGlassSharedProps & {
	accessibilityLabel?: string;
	label: string;
	systemImage?: SwiftUIButtonProps["systemImage"];
};

/** App-owned native Liquid Glass button with a text label. */
export function ButtonGlass({
	accessibilityLabel,
	label,
	systemImage,
	...buttonProps
}: ButtonGlassProps) {
	return (
		<ButtonGlassControl
			{...buttonProps}
			accessibilityLabel={accessibilityLabel ?? label}
			content={{ kind: "label", label, systemImage }}
		/>
	);
}

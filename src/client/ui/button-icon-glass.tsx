import type { ButtonProps as SwiftUIButtonProps } from "@expo/ui/swift-ui";

import {
	ButtonGlassControl,
	type ButtonGlassSharedProps,
	type ButtonGlassSize,
} from "./button-glass-control";

export type { ButtonGlassSize as ButtonIconGlassSize };

export type ButtonIconGlassProps = Omit<ButtonGlassSharedProps, "radius"> & {
	accessibilityLabel: string;
	systemImage: NonNullable<SwiftUIButtonProps["systemImage"]>;
};

/** App-owned circular native Liquid Glass icon button. */
export function ButtonIconGlass({
	accessibilityLabel,
	systemImage,
	...buttonProps
}: ButtonIconGlassProps) {
	return (
		<ButtonGlassControl
			{...buttonProps}
			accessibilityLabel={accessibilityLabel}
			content={{ kind: "icon", systemImage }}
		/>
	);
}

import { type ComponentRef, forwardRef } from "react";
import {
	type AccessibilityState,
	Pressable,
	type PressableProps,
	type StyleProp,
	Text,
	type TextProps,
	type TextStyle,
	View,
	type ViewProps,
	type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

export type ItemVariant = "default" | "outline" | "muted";
export type ItemSize = "default" | "sm" | "xs";
export type ItemMediaVariant = "default" | "icon" | "image";
export type ItemGroupVariant = "default" | "outline";

type ItemViewProps = Omit<ViewProps, "style"> & {
	style?: StyleProp<ViewStyle>;
};

type ItemTextProps = Omit<TextProps, "style"> & {
	style?: StyleProp<TextStyle>;
};

export type ItemProps = ItemViewProps & {
	size?: ItemSize;
	variant?: ItemVariant;
};

export type ItemPressableProps = Omit<PressableProps, "style"> & {
	size?: ItemSize;
	style?: PressableProps["style"];
	variant?: ItemVariant;
};

export type ItemGroupProps = ItemViewProps & {
	variant?: ItemGroupVariant;
};
export type ItemSeparatorProps = ItemViewProps;

export type ItemMediaProps = ItemViewProps & {
	variant?: ItemMediaVariant;
};

export type ItemContentProps = ItemViewProps;
export type ItemActionsProps = ItemViewProps;
export type ItemHeaderProps = ItemViewProps;
export type ItemFooterProps = ItemViewProps;
export type ItemTitleProps = ItemTextProps;
export type ItemDescriptionProps = ItemTextProps;
export type ItemActionsLabelProps = ItemTextProps;

type ItemViewRef = ComponentRef<typeof View>;
type ItemTextRef = ComponentRef<typeof Text>;
type ItemPressableRef = ComponentRef<typeof Pressable>;

export const ItemGroup = forwardRef<ItemViewRef, ItemGroupProps>(
	function ItemGroup(
		{ accessibilityRole, style, variant = "default", ...viewProps },
		ref,
	) {
		groupStyles.useVariants({
			variant: variant === "default" ? undefined : variant,
		});

		return (
			<View
				accessibilityRole={accessibilityRole ?? "list"}
				ref={ref}
				style={[groupStyles.group, style]}
				{...viewProps}
			/>
		);
	},
);

export const ItemSeparator = forwardRef<ItemViewRef, ItemSeparatorProps>(
	function ItemSeparator({ style, ...viewProps }, ref) {
		return (
			<View
				{...viewProps}
				accessibilityElementsHidden
				accessible={false}
				ref={ref}
				style={[styles.separator, style]}
			/>
		);
	},
);

export const Item = forwardRef<ItemViewRef, ItemProps>(function Item(
	{ size = "default", style, variant = "default", ...viewProps },
	ref,
) {
	itemStyles.useVariants({
		size: size === "default" ? undefined : size,
		variant: variant === "default" ? undefined : variant,
	});

	return <View ref={ref} style={[itemStyles.item, style]} {...viewProps} />;
});

export const ItemPressable = forwardRef<ItemPressableRef, ItemPressableProps>(
	function ItemPressable(
		{
			accessibilityRole,
			accessibilityState,
			disabled = false,
			size = "default",
			style,
			variant = "default",
			...pressableProps
		},
		ref,
	) {
		itemStyles.useVariants({
			size: size === "default" ? undefined : size,
			variant: variant === "default" ? undefined : variant,
		});
		const isDisabled = disabled === true;
		const itemAccessibilityState: AccessibilityState = {
			...accessibilityState,
			disabled: isDisabled,
		};

		return (
			<Pressable
				accessibilityRole={accessibilityRole ?? "button"}
				accessibilityState={itemAccessibilityState}
				disabled={isDisabled}
				ref={ref}
				style={(state) => [
					itemStyles.item,
					styles.interactive,
					typeof style === "function" ? style(state) : style,
					state.pressed ? styles.pressed : undefined,
					isDisabled ? styles.disabled : undefined,
				]}
				{...pressableProps}
			/>
		);
	},
);

export const ItemMedia = forwardRef<ItemViewRef, ItemMediaProps>(
	function ItemMedia({ style, variant = "default", ...viewProps }, ref) {
		mediaStyles.useVariants({
			variant: variant === "default" ? undefined : variant,
		});

		return <View ref={ref} style={[mediaStyles.media, style]} {...viewProps} />;
	},
);

export const ItemContent = forwardRef<ItemViewRef, ItemContentProps>(
	function ItemContent({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.content, style]} {...viewProps} />;
	},
);

export const ItemTitle = forwardRef<ItemTextRef, ItemTitleProps>(
	function ItemTitle({ numberOfLines = 1, style, ...textProps }, ref) {
		return (
			<Text
				numberOfLines={numberOfLines}
				ref={ref}
				style={[styles.title, style]}
				{...textProps}
			/>
		);
	},
);

export const ItemDescription = forwardRef<ItemTextRef, ItemDescriptionProps>(
	function ItemDescription({ numberOfLines = 2, style, ...textProps }, ref) {
		return (
			<Text
				numberOfLines={numberOfLines}
				ref={ref}
				style={[styles.description, style]}
				{...textProps}
			/>
		);
	},
);

export const ItemActionsLabel = forwardRef<ItemTextRef, ItemActionsLabelProps>(
	function ItemActionsLabel({ numberOfLines = 1, style, ...textProps }, ref) {
		return (
			<Text
				numberOfLines={numberOfLines}
				ref={ref}
				style={[styles.label, style]}
				{...textProps}
			/>
		);
	},
);

export const ItemActions = forwardRef<ItemViewRef, ItemActionsProps>(
	function ItemActions({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.actions, style]} {...viewProps} />;
	},
);

export const ItemHeader = forwardRef<ItemViewRef, ItemHeaderProps>(
	function ItemHeader({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.header, style]} {...viewProps} />;
	},
);

export const ItemFooter = forwardRef<ItemViewRef, ItemFooterProps>(
	function ItemFooter({ style, ...viewProps }, ref) {
		return <View ref={ref} style={[styles.footer, style]} {...viewProps} />;
	},
);

const itemStyles = StyleSheet.create((theme) => ({
	item: {
		alignSelf: "stretch",
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: theme.spacing(4),
		padding: theme.spacing(4),
		borderWidth: theme.borders.thin,
		borderColor: "transparent",
		borderRadius: theme.radii.md,
		backgroundColor: "transparent",
		variants: {
			variant: {
				default: {
					borderColor: "transparent",
					backgroundColor: "transparent",
				},
				outline: {
					borderColor: theme.colors.border,
					backgroundColor: "transparent",
				},
				muted: {
					borderColor: "transparent",
					backgroundColor: theme.colors.muted,
				},
			},
			size: {
				default: {
					gap: theme.spacing(4),
					padding: theme.spacing(4),
				},
				sm: {
					gap: theme.spacing(2.5),
					paddingHorizontal: theme.spacing(4),
					paddingVertical: theme.spacing(3),
				},
				xs: {
					gap: theme.spacing(2),
					paddingHorizontal: theme.spacing(3),
					paddingVertical: theme.spacing(2),
				},
			},
		},
	},
}));

const mediaStyles = StyleSheet.create((theme) => ({
	media: {
		flexShrink: 0,
		alignSelf: "flex-start",
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing(2),
		backgroundColor: "transparent",
		variants: {
			variant: {
				default: {
					backgroundColor: "transparent",
				},
				icon: {
					width: theme.spacing(8),
					height: theme.spacing(8),
					borderWidth: theme.borders.thin,
					borderColor: theme.colors.border,
					borderRadius: theme.radii.sm,
					backgroundColor: theme.colors.muted,
				},
				image: {
					width: theme.spacing(10),
					height: theme.spacing(10),
					borderRadius: theme.radii.sm,
					overflow: "hidden",
				},
			},
		},
	},
}));

const groupStyles = StyleSheet.create((theme) => ({
	group: {
		alignSelf: "stretch",
		variants: {
			variant: {
				default: {},
				outline: {
					overflow: "hidden",
					borderWidth: theme.borders.thin,
					borderColor: theme.colors.border,
					borderRadius: theme.radii.md,
					backgroundColor: theme.colors.card,
				},
			},
		},
	},
}));

const styles = StyleSheet.create((theme) => ({
	interactive: {
		minHeight: theme.spacing(11),
	},
	pressed: {
		backgroundColor: theme.colors.secondary,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
	separator: {
		alignSelf: "stretch",
		height: theme.borders.hairline,
		backgroundColor: theme.colors.border,
	},
	content: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(1),
	},
	title: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.medium,
		color: theme.colors.foreground,
	},
	description: {
		...theme.typography.callout,
		flexShrink: 1,
		color: theme.colors.mutedForeground,
	},
	label: {
		...theme.typography.callout,
		flexShrink: 1,
		color: theme.colors.mutedForeground,
	},
	actions: {
		flexShrink: 0,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2),
	},
	header: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(2),
	},
	footer: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: theme.spacing(2),
	},
}));

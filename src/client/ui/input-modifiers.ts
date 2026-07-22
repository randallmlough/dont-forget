import {
	background,
	padding,
	shapes,
	type ViewModifier,
} from "@expo/ui/swift-ui/modifiers";
import type { AppTheme } from "@/client/theme/theme-contract";

/**
 * SwiftUI's border modifier is rectangular, so the input surface fakes a
 * rounded border with a border-color layer behind an inset fill layer. Input
 * applies it to the field; InputGroup applies it to the group HStack instead.
 */
export function createInputModifiers({
	disabled,
	focused,
	invalid,
	theme,
}: {
	disabled: boolean;
	focused: boolean;
	invalid: boolean;
	theme: AppTheme;
}): ViewModifier[] {
	const borderColor = invalid
		? theme.colors.destructive
		: focused
			? theme.colors.primary
			: theme.colors.input;

	return [
		padding({ horizontal: theme.spacing(3) }),
		background(
			disabled ? theme.colors.muted : theme.colors.card,
			shapes.roundedRectangle({
				cornerRadius: theme.radii.md - theme.borders.thin,
			}),
		),
		padding({ all: theme.borders.thin }),
		background(
			borderColor,
			shapes.roundedRectangle({ cornerRadius: theme.radii.md }),
		),
	];
}

/**
 * A user modifier takes ownership of its `$type`: app styling of that type is
 * dropped so the escape hatch replaces styling instead of wrapping it. Only
 * style-derived modifiers go through this filter — modifiers backing
 * functional props (disabled, gestures) must always apply. Input and
 * InputGroup expose their modifiers props under this same contract.
 */
export function omitUserOverridden(
	derived: ViewModifier[],
	userModifiers: ViewModifier[] | undefined,
): ViewModifier[] {
	if (!userModifiers?.length) return derived;
	const userTypes = new Set(userModifiers.map((modifier) => modifier.$type));
	return derived.filter((modifier) => !userTypes.has(modifier.$type));
}

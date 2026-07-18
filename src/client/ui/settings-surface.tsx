import { type SFSymbol, SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { GlassSurface } from "./glass-surface";

export type SurfaceSectionProps = {
	action?: {
		label: string;
		onPress: () => void;
	};
	children: ReactNode;
	title: string;
};

export function SurfaceSection({
	action,
	children,
	title,
}: SurfaceSectionProps) {
	return (
		<View style={styles.section}>
			<View style={styles.sectionHeading}>
				<Text style={styles.sectionTitle}>{title}</Text>
				{action ? (
					<Pressable
						accessibilityRole="button"
						onPress={action.onPress}
						style={({ pressed }) => [
							styles.sectionAction,
							pressed ? styles.pressed : undefined,
						]}
					>
						<Text style={styles.sectionActionLabel}>{action.label}</Text>
					</Pressable>
				) : null}
			</View>
			{children}
		</View>
	);
}

export type SurfaceCardProps = {
	children: ReactNode;
	groupPosition?: "only" | "first" | "middle" | "last";
	testID?: string;
	tone?: "default" | "selected";
};

export function SurfaceCard({
	children,
	groupPosition = "only",
	testID,
	tone = "default",
}: SurfaceCardProps) {
	const groupStyle = {
		only: styles.card,
		first: styles.cardFirst,
		middle: styles.cardMiddle,
		last: styles.cardLast,
	}[groupPosition];

	return (
		<GlassSurface style={groupStyle} testID={testID} tone={tone}>
			{children}
		</GlassSurface>
	);
}

export type SurfaceRowProps = {
	accessibilityHint?: string;
	accessibilityLabel?: string;
	detail?: string;
	disabled?: boolean;
	disclosure?: boolean;
	divider?: boolean;
	label: string;
	leading?: ReactNode;
	onPress?: () => void;
	selected?: boolean;
	symbol?: SFSymbol;
	tone?: "default" | "destructive";
	trailing?: ReactNode;
	value?: string;
};

export function SurfaceRow({
	accessibilityHint,
	accessibilityLabel,
	detail,
	disabled = false,
	disclosure,
	divider = false,
	label,
	leading,
	onPress,
	selected = false,
	symbol,
	tone = "default",
	trailing,
	value,
}: SurfaceRowProps) {
	const { theme } = useUnistyles();
	const showDisclosure = disclosure ?? Boolean(onPress && !trailing);
	const content = (
		<View style={[styles.row, divider ? styles.rowDivider : undefined]}>
			{leading ??
				(symbol ? (
					<View style={styles.symbolBackground}>
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name={symbol}
							size={19}
							tintColor={theme.colors.inverseText}
							weight="medium"
						/>
					</View>
				) : null)}
			<View style={styles.rowText}>
				<Text
					numberOfLines={1}
					style={[
						styles.rowLabel,
						tone === "destructive" ? styles.destructive : undefined,
					]}
				>
					{label}
				</Text>
				{detail ? (
					<Text numberOfLines={2} style={styles.rowDetail}>
						{detail}
					</Text>
				) : null}
			</View>
			{value ? (
				<Text numberOfLines={1} style={styles.rowValue}>
					{value}
				</Text>
			) : null}
			{trailing}
			{showDisclosure ? (
				<SymbolView
					accessibilityElementsHidden
					accessible={false}
					name="chevron.right"
					size={14}
					tintColor={theme.colors.textMuted}
					weight="semibold"
				/>
			) : null}
		</View>
	);

	if (!onPress) return content;

	return (
		<Pressable
			accessibilityHint={accessibilityHint}
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityRole="button"
			accessibilityState={{ disabled, selected }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				pressed ? styles.pressed : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			{content}
		</Pressable>
	);
}

export type InitialsAvatarProps = {
	label: string;
	size?: "small" | "large";
};

export function InitialsAvatar({ label, size = "small" }: InitialsAvatarProps) {
	return (
		<View
			accessibilityLabel={label}
			style={[styles.avatar, size === "large" ? styles.avatarLarge : undefined]}
		>
			<Text
				style={[
					styles.avatarLabel,
					size === "large" ? styles.avatarLabelLarge : undefined,
				]}
			>
				{initials(label)}
			</Text>
		</View>
	);
}

function initials(label: string): string {
	const parts = label.trim().split(/\s+/).filter(Boolean).slice(0, 2);
	return parts.map((part) => part[0]?.toUpperCase()).join("") || "?";
}

const styles = StyleSheet.create((theme) => ({
	section: {
		gap: theme.spacing(2),
	},
	sectionHeading: {
		minHeight: theme.spacing(7),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing(1),
	},
	sectionTitle: {
		...theme.typography.overline,
		color: theme.colors.textMuted,
		textTransform: "uppercase",
	},
	sectionAction: {
		minHeight: theme.spacing(11),
		justifyContent: "center",
		paddingHorizontal: theme.spacing(2),
		marginVertical: -theme.spacing(2),
	},
	sectionActionLabel: {
		...theme.typography.callout,
		color: theme.colors.primary,
	},
	card: {
		borderRadius: theme.radii.card,
	},
	cardFirst: {
		borderTopLeftRadius: theme.radii.card,
		borderTopRightRadius: theme.radii.card,
	},
	cardMiddle: {},
	cardLast: {
		borderBottomLeftRadius: theme.radii.card,
		borderBottomRightRadius: theme.radii.card,
	},
	row: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(2.5),
	},
	rowDivider: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.divider,
	},
	rowText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(0.5),
	},
	rowLabel: {
		...theme.typography.body,
		color: theme.colors.text,
	},
	rowDetail: {
		...theme.typography.caption,
		color: theme.colors.textMuted,
	},
	rowValue: {
		...theme.typography.callout,
		color: theme.colors.textMuted,
		maxWidth: "45%",
	},
	symbolBackground: {
		width: theme.spacing(9),
		height: theme.spacing(9),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
		backgroundColor: theme.colors.primary,
	},
	destructive: {
		color: theme.colors.destructive,
	},
	avatar: {
		width: theme.spacing(11),
		height: theme.spacing(11),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.pill,
		backgroundColor: theme.colors.primary,
	},
	avatarLarge: {
		width: theme.spacing(28),
		height: theme.spacing(28),
	},
	avatarLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.inverseText,
	},
	avatarLabelLarge: {
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes.title,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));

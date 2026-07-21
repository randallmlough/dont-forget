import { type SFSymbol, SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button } from "./button";
import { GlassSurface } from "./glass-surface";

export type SurfaceSectionProps = {
	action?: {
		label: string;
		onPress: () => void;
	};
	children?: ReactNode;
	detail?: string;
	title: string;
};

export function SurfaceSection({
	action,
	children,
	detail,
	title,
}: SurfaceSectionProps) {
	return (
		<View style={styles.section}>
			<View style={styles.sectionHeading}>
				<Text style={styles.sectionTitle}>{title}</Text>
				{detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
				{action ? (
					<Button
						onPress={action.onPress}
						style={styles.sectionAction}
						textStyle={styles.sectionActionLabel}
						variant="ghost"
					>
						{action.label}
					</Button>
				) : null}
			</View>
			{children}
		</View>
	);
}

export type GroupPosition = "only" | "first" | "middle" | "last";

export function groupPosition(index: number, length: number): GroupPosition {
	if (length === 1) return "only";
	if (index === 0) return "first";
	if (index === length - 1) return "last";
	return "middle";
}

export type SurfaceCardProps = {
	children: ReactNode;
	groupPosition?: GroupPosition;
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
	const rowContent = (
		<>
			{leading ??
				(symbol ? (
					<View style={styles.symbolBackground}>
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name={symbol}
							size={19}
							tintColor={theme.colors.primaryForeground}
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
		</>
	);
	const disclosureSymbol = showDisclosure ? (
		<SymbolView
			accessibilityElementsHidden
			accessible={false}
			name="chevron.right"
			size={14}
			tintColor={theme.colors.mutedForeground}
			weight="semibold"
		/>
	) : null;

	const content = (
		<View style={[styles.row, divider ? styles.rowDivider : undefined]}>
			{rowContent}
			{trailing}
			{disclosureSymbol}
		</View>
	);

	if (!onPress) return content;

	const control = (
		<Button
			accessibilityHint={accessibilityHint}
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityState={{ disabled, selected }}
			disabled={disabled}
			onPress={onPress}
			style={trailing ? styles.rowControl : styles.rowButton}
			variant="link"
		>
			{trailing ? (
				<>
					{rowContent}
					{disclosureSymbol}
				</>
			) : (
				content
			)}
		</Button>
	);

	if (!trailing) return control;

	return (
		<View
			accessible={false}
			style={[
				styles.rowWithTrailing,
				divider ? styles.rowDivider : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			{control}
			<View style={styles.rowTrailing}>{trailing}</View>
		</View>
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
		color: theme.colors.mutedForeground,
		textTransform: "uppercase",
	},
	sectionDetail: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
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
		borderRadius: theme.radii["2xl"],
	},
	cardFirst: {
		borderTopLeftRadius: theme.radii["2xl"],
		borderTopRightRadius: theme.radii["2xl"],
	},
	cardMiddle: {},
	cardLast: {
		borderBottomLeftRadius: theme.radii["2xl"],
		borderBottomRightRadius: theme.radii["2xl"],
	},
	row: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingHorizontal: theme.spacing(4),
		paddingVertical: theme.spacing(2.5),
	},
	rowWithTrailing: {
		minHeight: theme.spacing(14),
		flexDirection: "row",
		alignItems: "stretch",
	},
	rowControl: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(3),
		paddingLeft: theme.spacing(4),
		paddingRight: theme.spacing(3),
		paddingVertical: theme.spacing(2.5),
	},
	rowButton: {
		alignSelf: "stretch",
		flexDirection: "column",
		alignItems: "stretch",
	},
	rowTrailing: {
		justifyContent: "center",
		paddingRight: theme.spacing(4),
		paddingVertical: theme.spacing(2.5),
	},
	rowDivider: {
		borderBottomWidth: theme.borders.hairline,
		borderBottomColor: theme.colors.border,
	},
	rowText: {
		flex: 1,
		minWidth: 0,
		gap: theme.spacing(0.5),
	},
	rowLabel: {
		...theme.typography.body,
		color: theme.colors.foreground,
	},
	rowDetail: {
		...theme.typography.caption,
		color: theme.colors.mutedForeground,
	},
	rowValue: {
		...theme.typography.callout,
		color: theme.colors.mutedForeground,
		maxWidth: "45%",
	},
	symbolBackground: {
		width: theme.spacing(9),
		height: theme.spacing(9),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.radii.full,
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
		borderRadius: theme.radii.full,
		backgroundColor: theme.colors.primary,
	},
	avatarLarge: {
		width: theme.spacing(28),
		height: theme.spacing(28),
	},
	avatarLabel: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.primaryForeground,
	},
	avatarLabelLarge: {
		fontFamily: theme.fontFamilies.serif,
		fontSize: theme.fontSizes["3xl"],
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));

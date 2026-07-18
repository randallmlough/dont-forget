import { type SFSymbol, SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { GlassSurface } from "./glass-surface";

export type AppButtonProps = {
	accessibilityLabel?: string;
	disabled?: boolean;
	label: string;
	onPress: () => void;
	symbol?: SFSymbol;
	variant?: "default" | "primary" | "destructive";
};

export function AppButton({
	accessibilityLabel,
	disabled = false,
	label,
	onPress,
	symbol,
	variant = "default",
}: AppButtonProps) {
	const { theme } = useUnistyles();
	const tintColor =
		variant === "destructive"
			? theme.colors.destructive
			: variant === "primary"
				? theme.colors.primaryActionText
				: theme.colors.text;

	return (
		<Pressable
			accessibilityLabel={accessibilityLabel}
			accessibilityRole="button"
			accessibilityState={{ disabled }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.pressable,
				pressed ? styles.pressed : undefined,
				disabled ? styles.disabled : undefined,
			]}
		>
			<GlassSurface
				interactive
				style={[
					styles.surface,
					variant === "primary" ? styles.primarySurface : undefined,
				]}
				tone={variant === "primary" ? "selected" : "default"}
			>
				<View style={styles.content}>
					{symbol ? (
						<SymbolView
							accessibilityElementsHidden
							accessible={false}
							name={symbol}
							size={17}
							tintColor={tintColor}
							weight="medium"
						/>
					) : null}
					<Text
						style={[
							styles.label,
							variant === "primary" ? styles.primaryLabel : undefined,
							variant === "destructive" ? styles.destructiveLabel : undefined,
						]}
					>
						{label}
					</Text>
				</View>
			</GlassSurface>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	pressable: {
		alignSelf: "flex-start",
	},
	surface: {
		minHeight: theme.spacing(11),
		justifyContent: "center",
		borderRadius: theme.radii.pill,
	},
	primarySurface: {
		backgroundColor: theme.colors.primaryActionBackground,
		borderColor: theme.colors.primaryActionBackground,
	},
	content: {
		minHeight: theme.spacing(11),
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing(2),
		paddingHorizontal: theme.spacing(4),
	},
	label: {
		...theme.typography.callout,
		fontWeight: theme.fontWeights.semibold,
		color: theme.colors.text,
	},
	primaryLabel: {
		color: theme.colors.primaryActionText,
	},
	destructiveLabel: {
		color: theme.colors.destructive,
	},
	pressed: {
		opacity: theme.opacities.pressed,
	},
	disabled: {
		opacity: theme.opacities.disabled,
	},
}));

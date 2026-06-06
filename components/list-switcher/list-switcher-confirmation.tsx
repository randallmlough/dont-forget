import { Pressable, Text, View } from "react-native";
import { styles } from "./list-switcher-styles";

export function ListSwitcherConfirmation({
	body,
	cancelLabel = "Cancel",
	confirmAccessibilityHint,
	confirmLabel,
	error,
	isSubmitting,
	onCancel,
	onConfirm,
	submittingLabel,
	title,
	variant,
}: {
	body: string;
	cancelLabel?: string;
	confirmAccessibilityHint?: string;
	confirmLabel: string;
	error: string | null;
	isSubmitting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	submittingLabel: string;
	title: string;
	variant: "primary" | "destructive";
}) {
	return (
		<View style={styles.createForm}>
			<Text style={styles.title}>{title}</Text>
			<Text style={styles.formHelp}>{body}</Text>
			{error ? <Text style={styles.errorText}>{error}</Text> : null}
			<View style={styles.formActions}>
				<Pressable
					accessibilityRole="button"
					disabled={isSubmitting}
					onPress={onCancel}
					style={({ pressed }) => [
						styles.secondaryButton,
						isSubmitting ? styles.disabledRow : undefined,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.secondaryButtonLabel}>{cancelLabel}</Text>
				</Pressable>
				<Pressable
					accessibilityHint={confirmAccessibilityHint}
					accessibilityRole="button"
					accessibilityState={{ disabled: isSubmitting }}
					disabled={isSubmitting}
					onPress={onConfirm}
					style={({ pressed }) => [
						variant === "destructive"
							? styles.destructiveButton
							: styles.primaryButton,
						isSubmitting ? styles.disabledRow : undefined,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text
						style={
							variant === "destructive"
								? styles.destructiveButtonLabel
								: styles.primaryButtonLabel
						}
					>
						{isSubmitting ? submittingLabel : confirmLabel}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

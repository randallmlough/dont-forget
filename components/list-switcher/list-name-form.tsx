import { Pressable, Text, TextInput, View } from "react-native";
import { styles } from "./list-switcher-styles";

export function ListNameForm({
	canSubmit,
	draft,
	error,
	isSubmitting,
	isTooLong,
	onCancel,
	onChangeDraft,
	onSubmit,
	submitLabel,
	submittingLabel,
	title,
}: {
	canSubmit: boolean;
	draft: string;
	error: string | null;
	isSubmitting: boolean;
	isTooLong: boolean;
	onCancel: () => void;
	onChangeDraft: (value: string) => void;
	onSubmit: () => void;
	submitLabel: string;
	submittingLabel: string;
	title: string;
}) {
	return (
		<View style={styles.createForm}>
			<View style={styles.header}>
				<Text style={styles.title}>{title}</Text>
			</View>
			<View style={styles.fieldGroup}>
				<Text style={styles.inputLabel}>List name</Text>
				<TextInput
					accessibilityLabel="List name"
					autoCapitalize="words"
					editable={!isSubmitting}
					multiline={false}
					onChangeText={onChangeDraft}
					onSubmitEditing={onSubmit}
					placeholder="Groceries, Costco, Camping..."
					returnKeyType="done"
					style={styles.input}
					value={draft}
				/>
				{isTooLong ? (
					<Text style={styles.validationText}>
						List name must be 80 characters or fewer.
					</Text>
				) : null}
				{error ? <Text style={styles.errorText}>{error}</Text> : null}
			</View>
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
					<Text style={styles.secondaryButtonLabel}>Cancel</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ disabled: !canSubmit }}
					disabled={!canSubmit}
					onPress={onSubmit}
					style={({ pressed }) => [
						styles.primaryButton,
						!canSubmit ? styles.disabledRow : undefined,
						pressed ? styles.pressed : undefined,
					]}
				>
					<Text style={styles.primaryButtonLabel}>
						{isSubmitting ? submittingLabel : submitLabel}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

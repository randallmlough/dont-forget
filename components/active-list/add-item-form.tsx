import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useActiveList } from "./context";

export function ActiveListAddItemForm() {
	const { actions } = useActiveList();
	const [name, setName] = useState("");
	const trimmedName = name.trim();
	const canSubmit = trimmedName.length > 0;

	function submit() {
		if (!canSubmit) return;
		void actions.addItem(trimmedName);
		setName("");
	}

	return (
		<View style={styles.addForm}>
			<TextInput
				accessibilityLabel="Item name"
				value={name}
				onChangeText={setName}
				placeholder="Add an Item"
				returnKeyType="done"
				onSubmitEditing={submit}
				style={styles.input}
			/>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ disabled: !canSubmit }}
				disabled={!canSubmit}
				onPress={submit}
				style={({ pressed }) => [
					styles.addButton,
					!canSubmit ? styles.addButtonDisabled : undefined,
					pressed && canSubmit ? styles.addButtonPressed : undefined,
				]}
			>
				<Text style={styles.addButtonLabel}>Add</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	addForm: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing(2.5),
		padding: theme.spacing(4),
		backgroundColor: theme.colors.surface,
		borderTopWidth: theme.borders.hairline,
		borderTopColor: theme.colors.border,
	},
	input: {
		flex: 1,
		minHeight: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		borderWidth: theme.borders.thin,
		borderColor: theme.colors.inputBorder,
		paddingHorizontal: theme.spacing(3.5),
		color: theme.colors.text,
		fontSize: theme.fontSizes.body,
		backgroundColor: theme.colors.surface,
	},
	addButton: {
		minWidth: theme.spacing(18),
		height: theme.spacing(12),
		borderRadius: theme.radii.control,
		borderCurve: "continuous",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.colors.primary,
	},
	addButtonDisabled: {
		backgroundColor: theme.colors.primaryDisabled,
	},
	addButtonPressed: {
		opacity: theme.opacities.pressed,
	},
	addButtonLabel: {
		...theme.typography.controlLabel,
		color: theme.colors.inverseText,
	},
}));

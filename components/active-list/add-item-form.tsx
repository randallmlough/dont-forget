import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useActiveList } from "./context";
import { activeListStyles as styles } from "./styles";

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

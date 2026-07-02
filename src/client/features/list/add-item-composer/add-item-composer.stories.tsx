import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { AddItemComposer } from "@/client/features/list/add-item-composer";

const meta = {
	title: "Components/Add Item Composer",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Focused: Story = {
	render: () => <FocusedAddItemComposerStory />,
};

function FocusedAddItemComposerStory() {
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState("");
	const [notes, setNotes] = useState("");
	const [isNoteOpen, setIsNoteOpen] = useState(false);
	const canSubmit = name.trim().length > 0;

	function toggleNote() {
		if (isNoteOpen) {
			setNotes("");
		}
		setIsNoteOpen(!isNoteOpen);
	}

	return (
		<SafeAreaProvider
			initialMetrics={{
				frame: { x: 0, y: 0, width: 390, height: 844 },
				insets: { top: 47, right: 0, bottom: 34, left: 0 },
			}}
		>
			<View style={styles.canvas}>
				<AddItemComposer
					draft={{ name, quantity, notes }}
					ui={{
						isOpen: true,
						isNoteOpen,
						canSubmit,
						listName: "Groceries",
						errorMessage: null,
					}}
					actions={{
						open: () => undefined,
						dismiss: () => undefined,
						submit: () => undefined,
						changeName: setName,
						changeQuantity: setQuantity,
						changeNotes: setNotes,
						toggleNote,
					}}
				/>
			</View>
		</SafeAreaProvider>
	);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
}));

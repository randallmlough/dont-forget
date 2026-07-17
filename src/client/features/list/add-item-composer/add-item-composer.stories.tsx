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

export const Resting: Story = {
	render: () => <InteractiveAddItemComposerStory initiallyOpen={false} />,
};

export const Focused: Story = {
	render: () => <InteractiveAddItemComposerStory initiallyOpen />,
};

export const FocusedWithNote: Story = {
	render: () => (
		<InteractiveAddItemComposerStory initiallyOpen initiallyNoting />
	),
};

function InteractiveAddItemComposerStory({
	initiallyOpen,
	initiallyNoting = false,
}: {
	initiallyOpen: boolean;
	initiallyNoting?: boolean;
}) {
	const [name, setName] = useState("");
	const [quantity, setQuantity] = useState("");
	const [notes, setNotes] = useState("");
	const [isOpen, setIsOpen] = useState(initiallyOpen);
	const [isNoteOpen, setIsNoteOpen] = useState(initiallyNoting);
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
						isOpen,
						isNoteOpen,
						canSubmit,
						listName: "Groceries",
						errorMessage: null,
					}}
					actions={{
						open: () => setIsOpen(true),
						dismiss: () => setIsOpen(false),
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

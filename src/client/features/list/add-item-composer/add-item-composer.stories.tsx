import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { AddItemComposer } from "@/client/features/list/add-item-composer";

const meta = {
	title: "Features/List/Components/Add Item Composer",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Resting: Story = {
	render: () => <InteractiveAddItemComposerStory initiallyOpen={false} />,
};

export const Focused: Story = {
	render: () => <InteractiveAddItemComposerStory initiallyOpen />,
};

export const FocusedWithDetails: Story = {
	render: () => (
		<InteractiveAddItemComposerStory
			initiallyOpen
			initialDraft={{
				name: "Whole milk",
				quantity: "1 gallon",
				notes: "Organic if available",
			}}
		/>
	),
};

function InteractiveAddItemComposerStory({
	initiallyOpen,
	initialDraft = { name: "", quantity: "", notes: "" },
}: {
	initiallyOpen: boolean;
	initialDraft?: { name: string; quantity: string; notes: string };
}) {
	const [name, setName] = useState(initialDraft.name);
	const [quantity, setQuantity] = useState(initialDraft.quantity);
	const [notes, setNotes] = useState(initialDraft.notes);
	const [isOpen, setIsOpen] = useState(initiallyOpen);
	const [selectedListId, setSelectedListId] = useState("lst_groceries");
	const canSubmit = name.trim().length > 0;

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
						canSubmit,
						selectedListId,
						listOptions: [
							{ id: "lst_groceries", name: "Groceries" },
							{ id: "lst_costco", name: "Costco" },
							{ id: "lst_hardware", name: "Hardware" },
						],
					}}
					actions={{
						open: () => setIsOpen(true),
						dismiss: () => setIsOpen(false),
						changeList: setSelectedListId,
						submit: () => undefined,
						changeName: setName,
						changeQuantity: setQuantity,
						changeNotes: setNotes,
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

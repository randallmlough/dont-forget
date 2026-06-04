import type { Meta, StoryObj } from "@storybook/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { AddItemComposer } from "@/components/add-item-composer";

const STORY_KEYBOARD_HEIGHT = 302;

const meta = {
	title: "Components/Add Item Composer",
	component: AddItemComposer,
} satisfies Meta<typeof AddItemComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Focused: Story = {
	args: {
		draft: { name: "", quantity: "", notes: "" },
		ui: {
			isOpen: true,
			isNoteOpen: false,
			canSubmit: false,
			listName: "Groceries",
			errorMessage: null,
			keyboardHeight: STORY_KEYBOARD_HEIGHT,
			shouldFocusNameInput: false,
		},
		actions: {
			open: noop,
			dismiss: noop,
			submit: noop,
			changeName: noop,
			changeQuantity: noop,
			changeNotes: noop,
			toggleNote: noop,
		},
	},
	render: () => <FocusedAddItemComposerStory />,
};

function noop() {}

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
						keyboardHeight: STORY_KEYBOARD_HEIGHT,
						shouldFocusNameInput: false,
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
				<IOSKeyboardPreview />
			</View>
		</SafeAreaProvider>
	);
}

function IOSKeyboardPreview() {
	return (
		<View accessibilityLabel="iOS keyboard preview" style={styles.keyboard}>
			<View style={styles.keyboardRow}>
				{["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"].map((key) => (
					<KeyPreview key={key} label={key} />
				))}
			</View>
			<View style={styles.keyboardRow}>
				{["A", "S", "D", "F", "G", "H", "J", "K", "L"].map((key) => (
					<KeyPreview key={key} label={key} />
				))}
			</View>
			<View style={styles.keyboardRow}>
				<KeyPreview label="shift" wide />
				{["Z", "X", "C", "V", "B", "N", "M"].map((key) => (
					<KeyPreview key={key} label={key} />
				))}
				<KeyPreview label="delete" wide />
			</View>
			<View style={styles.keyboardRow}>
				<KeyPreview label="123" wide />
				<KeyPreview label="space" fill />
				<KeyPreview label="return" wide />
			</View>
			<View style={styles.homeIndicator} />
		</View>
	);
}

function KeyPreview({
	label,
	fill = false,
	wide = false,
}: {
	label: string;
	fill?: boolean;
	wide?: boolean;
}) {
	return (
		<View
			style={[
				styles.key,
				fill ? styles.keyFill : undefined,
				wide ? styles.keyWide : undefined,
			]}
		>
			<Text style={styles.keyText}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	canvas: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	keyboard: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: STORY_KEYBOARD_HEIGHT,
		paddingTop: theme.spacing(2),
		paddingHorizontal: theme.spacing(1.5),
		backgroundColor: "rgba(210, 214, 220, 0.96)",
		gap: theme.spacing(1.5),
	},
	keyboardRow: {
		minHeight: theme.spacing(10),
		flexDirection: "row",
		justifyContent: "center",
		gap: theme.spacing(1),
	},
	key: {
		width: theme.spacing(8),
		height: theme.spacing(10),
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.spacing(1.5),
		backgroundColor: "rgba(255, 255, 255, 0.96)",
		boxShadow: "0 1px 1px rgba(16, 42, 67, 0.22)",
	},
	keyWide: {
		width: theme.spacing(13),
		backgroundColor: "rgba(174, 181, 191, 0.98)",
	},
	keyFill: {
		flex: 1,
		maxWidth: theme.spacing(45),
	},
	keyText: {
		color: theme.colors.text,
		fontSize: theme.fontSizes.caption,
		fontWeight: theme.fontWeights.medium,
	},
	homeIndicator: {
		alignSelf: "center",
		width: theme.spacing(34),
		height: theme.spacing(1.25),
		marginTop: theme.spacing(1),
		borderRadius: theme.spacing(1),
		backgroundColor: "rgba(16, 42, 67, 0.9)",
	},
}));

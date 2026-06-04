import { useEffect, useReducer } from "react";
import { Keyboard } from "react-native";
import { AddItemComposer } from "@/components/add-item-composer";
import { useActiveList } from "./context";

type ComposerState = {
	isOpen: boolean;
	keyboardHeight: number;
	name: string;
	quantity: string;
	notes: string;
	isNoteOpen: boolean;
	isSubmitting: boolean;
};

type ComposerAction =
	| { type: "opened" }
	| { type: "dismissed" }
	| { type: "keyboardShown"; height: number }
	| { type: "keyboardHidden" }
	| { type: "nameChanged"; value: string }
	| { type: "quantityChanged"; value: string }
	| { type: "notesChanged"; value: string }
	| { type: "noteToggled" }
	| { type: "submitStarted" }
	| { type: "submitSucceeded" }
	| { type: "submitFailed" };

export function ActiveListAddItemForm() {
	const { actions, meta, state } = useActiveList();
	const [composer, dispatchComposer] = useReducer(
		composerReducer,
		undefined,
		initialComposerState,
	);
	const trimmedName = composer.name.trim();
	const canSubmit = trimmedName.length > 0 && !composer.isSubmitting;

	useEffect(() => {
		const showSubscription = Keyboard.addListener(
			"keyboardWillShow",
			(event) => {
				dispatchComposer({
					type: "keyboardShown",
					height: event.endCoordinates.height,
				});
			},
		);
		const hideSubscription = Keyboard.addListener("keyboardWillHide", () => {
			dispatchComposer({ type: "keyboardHidden" });
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	function openComposer() {
		dispatchComposer({ type: "opened" });
	}

	function dismissComposer() {
		dispatchComposer({ type: "dismissed" });
		Keyboard.dismiss();
	}

	async function submit() {
		if (!canSubmit) return;

		dispatchComposer({ type: "submitStarted" });
		try {
			await actions.addItem({
				name: trimmedName,
				quantity: composer.quantity,
				notes: composer.notes,
			});
			dispatchComposer({ type: "submitSucceeded" });
			dismissComposer();
		} catch {
			dispatchComposer({ type: "submitFailed" });
		}
	}

	return (
		<AddItemComposer
			draft={{
				name: composer.name,
				quantity: composer.quantity,
				notes: composer.notes,
			}}
			ui={{
				isOpen: composer.isOpen,
				isNoteOpen: composer.isNoteOpen,
				canSubmit,
				listName: state.listName,
				errorMessage: meta.errorMessage,
				keyboardHeight: composer.keyboardHeight,
				shouldFocusNameInput: composer.isOpen,
			}}
			actions={{
				open: openComposer,
				dismiss: dismissComposer,
				submit,
				changeName: (value) => dispatchComposer({ type: "nameChanged", value }),
				changeQuantity: (value) =>
					dispatchComposer({ type: "quantityChanged", value }),
				changeNotes: (value) =>
					dispatchComposer({ type: "notesChanged", value }),
				toggleNote: () => dispatchComposer({ type: "noteToggled" }),
			}}
		/>
	);
}

function initialComposerState(): ComposerState {
	return {
		isOpen: false,
		keyboardHeight: 0,
		name: "",
		quantity: "",
		notes: "",
		isNoteOpen: false,
		isSubmitting: false,
	};
}

function composerReducer(
	state: ComposerState,
	action: ComposerAction,
): ComposerState {
	switch (action.type) {
		case "opened":
			return { ...state, isOpen: true };
		case "dismissed":
			return { ...state, isOpen: false, isSubmitting: false };
		case "keyboardShown":
			return { ...state, keyboardHeight: action.height };
		case "keyboardHidden":
			return { ...state, keyboardHeight: 0 };
		case "nameChanged":
			return { ...state, name: action.value };
		case "quantityChanged":
			return { ...state, quantity: action.value };
		case "notesChanged":
			return { ...state, notes: action.value };
		case "noteToggled":
			return state.isNoteOpen
				? { ...state, isNoteOpen: false, notes: "" }
				: { ...state, isNoteOpen: true };
		case "submitStarted":
			return { ...state, isSubmitting: true };
		case "submitSucceeded":
			return {
				...state,
				name: "",
				quantity: "",
				notes: "",
				isNoteOpen: false,
				isSubmitting: false,
			};
		case "submitFailed":
			return { ...state, isSubmitting: false };
	}
}

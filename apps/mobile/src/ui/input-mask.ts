import { type TextFieldSelection, useNativeState } from "@expo/ui/swift-ui";

/**
 * Owns the native state pair and worklet commit for a masked Input: each
 * keystroke is formatted synchronously on the UI thread and the caret snaps
 * to the end of the formatted text.
 *
 * Spread the result onto an `Input`; read the current masked value with
 * `mask.text.value`. `format` must be a pure module-scope function marked
 * `"worklet"`.
 *
 * Caret control requires iOS 18+, and mid-string edits move the caret to the
 * end — fine for append-style typing, which is what masks are for.
 */
export function useInputMask(format: (raw: string) => string) {
	const text = useNativeState("");
	const selection = useNativeState<TextFieldSelection>({ start: 0, end: 0 });

	function onTextChange(value: string) {
		"worklet";
		const formatted = format(value);

		// The Expo API intentionally mutates native state from the UI worklet.
		// eslint-disable-next-line react-hooks/immutability
		text.value = formatted;
		// eslint-disable-next-line react-hooks/immutability
		selection.value = { start: formatted.length, end: formatted.length };
	}

	return { text, selection, onTextChange };
}

/** Formats up to 10 digits as a US phone number, e.g. `(555) 123-4567`. */
export function formatPhoneNumberUS(value: string) {
	"worklet";
	const digits = value.replace(/\D/g, "").slice(0, 10);

	if (digits.length > 6) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}
	if (digits.length > 3) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	}
	return digits;
}

/** Groups up to 16 digits in blocks of four, e.g. `1234 5678 9012 3456`. */
export function formatCardNumber(value: string) {
	"worklet";
	const digits = value.replace(/\D/g, "").slice(0, 16);
	return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

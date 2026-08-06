import { Alert, type AlertButton } from "react-native";
import { nativeColorScheme } from "@mobile/theme/native-color-scheme";

export function themedAlert(
	title: string,
	message?: string,
	buttons?: AlertButton[],
) {
	Alert.alert(title, message, buttons, {
		userInterfaceStyle: nativeColorScheme(),
	});
}

export function themedPrompt(
	title: string,
	buttons: AlertButton[],
	defaultValue: string,
) {
	Alert.prompt(
		title,
		undefined,
		buttons,
		"plain-text",
		defaultValue,
		"default",
		{ userInterfaceStyle: nativeColorScheme() },
	);
}

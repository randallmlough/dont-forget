import { Button, type ButtonProps, Host, Menu } from "@expo/ui/swift-ui";
import {
	accessibilityLabel,
	disabled as disabledModifier,
	foregroundStyle,
	frame,
	glassEffect,
	labelStyle,
	padding,
} from "@expo/ui/swift-ui/modifiers";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { nativeColorScheme } from "@/client/theme/native-color-scheme";

export type ActionMenuItem = {
	label: string;
	onPress: () => void;
	role?: ButtonProps["role"];
	symbol?: ButtonProps["systemImage"];
};

export type ActionMenuButtonProps = {
	accessibilityLabel: string;
	actions: readonly ActionMenuItem[];
	disabled?: boolean;
};

export function ActionMenuButton({
	accessibilityLabel: menuAccessibilityLabel,
	actions,
	disabled = false,
}: ActionMenuButtonProps) {
	const { rt, theme } = useUnistyles();
	const colorScheme = nativeColorScheme(rt.themeName);

	return (
		// The SwiftUI Host does not join RN's responder system, so an enclosing
		// Pressable (e.g. SurfaceRow) would also fire on menu taps. Claiming the
		// responder here keeps the touch from reaching that ancestor.
		<View onStartShouldSetResponder={returnTrue} style={styles.host}>
			<Host colorScheme={colorScheme} style={styles.hostFill}>
				<Menu
					label="Actions"
					modifiers={[
						accessibilityLabel(menuAccessibilityLabel),
						disabledModifier(disabled),
						labelStyle("iconOnly"),
						foregroundStyle(theme.colors.foreground),
						frame({
							width: theme.spacing(8),
							height: theme.spacing(8),
						}),
						glassEffect({
							glass: { variant: "regular", interactive: true },
							shape: "circle",
						}),
						padding({ all: theme.spacing(1.5) }),
					]}
					systemImage="ellipsis"
				>
					{actions.map((action) => (
						<Button
							key={action.label}
							label={action.label}
							onPress={action.onPress}
							role={action.role}
							systemImage={action.symbol}
						/>
					))}
				</Menu>
			</Host>
		</View>
	);
}

function returnTrue(): boolean {
	return true;
}

const styles = StyleSheet.create((theme) => ({
	host: {
		width: theme.spacing(11),
		height: theme.spacing(11),
	},
	hostFill: {
		flex: 1,
	},
}));

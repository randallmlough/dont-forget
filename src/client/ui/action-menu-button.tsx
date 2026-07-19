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
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
	const colorScheme = rt.themeName === "dark" ? "dark" : "light";

	return (
		<Host colorScheme={colorScheme} style={styles.host}>
			<Menu
				label="Actions"
				modifiers={[
					accessibilityLabel(menuAccessibilityLabel),
					disabledModifier(disabled),
					labelStyle("iconOnly"),
					foregroundStyle(theme.colors.text),
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
	);
}

const styles = StyleSheet.create((theme) => ({
	host: {
		width: theme.spacing(11),
		height: theme.spacing(11),
	},
}));
